'use strict';

var assert = require('assert')
var wentto = require('wentto')

function inheritFrom(obj) {
    var F = function(){}
    F.prototype = obj;
    return new F();
}

function notimplemented(feature) {
    throw new Error ('not implemented' + (feature ? ': ' + feature : ''));
}

// Completion specification type
// http://www.ecma-international.org/ecma-262/5.1/#sec-8.9
function Completion(type, value, target) {
    this.type = type;
    this.value = value;
    this.target = target;
}

// Can point to any value in the machine.
// Variables are new Pointer(closure, varName).
// Object properties are new Pointer(closure, varName).
function Pointer(object, prop) {
    assert(typeof prop === 'string', 'Pointer prop must be a string')
    this.object = object;
    this.prop = prop;
}

Pointer.prototype.getValue = function () { return this.object[this.prop]; }
Pointer.prototype.setValue = function (val) { return this.object[this.prop] = val; }
Pointer.prototype.deleteValue = function () { return delete this.object[this.prop] }

module.exports = function installEval(Sjedon, ExecutionContext) {

// TODO deprecate these three instances in favour of the above Completion type
Sjedon.nothing = new Completion();
Sjedon.break_ = new Completion();
Sjedon.continue_ = new Completion();

function isReturn(comp) {
    return !(comp instanceof Completion);
}

ExecutionContext.prototype._eval = wentto([
    ['eval', function (go, ast) {
        var ret = Sjedon.nothing;

        assert(ast && typeof ast.length === 'number', '_evalBlock: "' + ast + '" is not an array of statements')

        for (var i = 0, len = ast.length; i < len; i++) {
            ret = this._evalStatement(ast[i])
            if (ret !== Sjedon.nothing) { return ret; }
        }

        return Sjedon.nothing;
    }],
    ['next', function (go, ast) {
        
    }]
])

ExecutionContext.prototype._evalBlock = function (body) {
    var ret = Sjedon.nothing;

    assert(body && typeof body.length === 'number', '_evalBlock: "' + body + '" is not an array of statements')

    for (var i = 0, len = body.length; i < len; i++) {
        ret = this._evalStatement(body[i])
        if (ret !== Sjedon.nothing) { return ret; }
    }

    return Sjedon.nothing;
}

ExecutionContext.prototype._evalStatement = function (statement) {
    var ret;
    var self = this;

    if (statement.type === 'ExpressionStatement') {
        this._evalExpression(statement.expression);
        return Sjedon.nothing;
    } else if (statement.type === 'BlockStatement') {
        return this._evalBlock(statement.body);
    } else if (statement.type === 'ReturnStatement') {
        if (statement.argument !== null) {
            return this._evalExpression(statement.argument)
        }
        return Sjedon.nothing;
    } else if (statement.type === 'BreakStatement') {
        if (statement.label) { notimplemented('Labeled break statement'); }
        return Sjedon.break_;
    } else if (statement.type === 'ContinueStatement') {
        if (statement.label) { notimplemented('labelled continue statement') }
        return Sjedon.continue_;
    } else if (statement.type === 'IfStatement') {
        if (this._evalExpression(statement.test)) {
            return this._evalStatement(statement.consequent);
        } else if (statement.alternate) {
            return this._evalStatement(statement.alternate);
        } else {
            return Sjedon.nothing;
        }
    } else if (statement.type === 'SwitchStatement') {
        var discriminant = this._evalExpression(statement.discriminant);
        var kase;

        for (var i = 0, len = statement.cases.length; i < len; i++) {
            kase = statement.cases[i];
            assert(kase.type === 'SwitchCase');
            if (kase.test === null /* default: */ ||
                    this._evalExpression(kase.test) === discriminant) {
                break;
            }
        }

        for (;i < len; i++) {
            kase = statement.cases[i];
            ret = this._evalBlock(kase.consequent);
            if (isReturn(ret)) { return ret; }
        }

        return Sjedon.nothing;
    } else if (statement.type === 'ForStatement') {
        for (   statement.init   && this._evalStatement(statement.init);
                statement.test   ?  this._evalExpression(statement.test) : true;
                statement.update && this._evalExpression(statement.update)) {
            ret = this._evalStatement(statement.body);
            if (isReturn(ret)) { return ret; }
            if (ret === Sjedon.break_) {
                return Sjedon.nothing;
            }
        }

        return Sjedon.nothing;
    } else if (statement.type === 'WhileStatement') {
        while (this._evalExpression(statement.test)) {
            ret = this._evalStatement(statement.body);
            if (isReturn(ret)) { return ret; }
            if (ret === Sjedon.break_) {
                return Sjedon.nothing;
            }
        }

        return Sjedon.nothing;
    } else if (statement.type === 'DoWhileStatement') {
        do {
            ret = this._evalStatement(statement.body)
            if (isReturn(ret)) { return ret; }
            if (ret === Sjedon.break_) {
                return Sjedon.nothing;
            }
        } while (this._evalExpression(statement.test))

        return Sjedon.nothing;
    } else if (statement.type === 'VariableDeclaration') {
        statement.declarations.forEach(function (decl) {
            if (decl.init) {
                var initial = self._evalExpression(decl.init)
                self.declareVar(decl.id.name, initial);
            } // else, it's just a placeholder.
        })

        return Sjedon.nothing;
    } else if (statement.type === 'FunctionDeclaration') {
        // TODO just this won't do for calling functions before they are declared!
        this.assignVar(statement.id.name, this._evalExpression(statement))
        return Sjedon.nothing;
    } else if (statement.type === 'EmptyStatement') {
        return Sjedon.nothing;
    } else {
        notimplemented('statement "' + statement.type + '"');
    }
    assert(false, 'Sjedon#_evalStatement must always return explicitly! If there is no "return", "break", or "throw", return a "Sjedon.nothing" reference');
};

ExecutionContext.prototype._evalExpression = function (expr) {
    assert(expr && expr.type, 'Sjedon#_evalExpression: pass an expression! (given: ' + typeof expr + '"' + expr + '".')
    if (expr.type === 'CallExpression') {
        return this._evalCall(expr.callee, undefined, expr['arguments'].map(this._evalExpression.bind(this)));
    } else if (expr.type === 'NewExpression') {
        var callee = this._evalExpression(expr.callee);
        var newObj = inheritFrom(callee.prototype || {});
        callee.apply(newObj, expr['arguments'].map(this._evalExpression.bind(this)))
        return newObj;
    } else if (expr.type === 'Literal') {
        return expr.value;
    } else if (expr.type === 'ArrayExpression') {
        this.pushOp('Array', expr.elements.length);
        var i = expr.elements.length;
        while (i--) {
            this.pushOp('Expression', expr.elements[i])
        }
    } else if (expr.type === 'ObjectExpression') {
        this.pushOp('Object', expr.properties.length);
        var i = expr.properties.length;
        while (i--) {
            this.pushOp('Expression', expr.properties[i].value)
            this.pushOp('MaybeIdentifier', expr.properties[i].key)
        }
    } else if (expr.type === 'FunctionExpression' || expr.type === 'FunctionDeclaration') {
        return this._evalFunction(expr, this /* TODO this is already the context */);
    } else if (expr.type === 'AssignmentExpression') {
        this.pushOp('PointerSet')
        this.pushOp('PointerCreate', expr.left)
        this.pushOp('Expression', expr.right)
    } else if (expr.type === 'SequenceExpression') {
        var i = expr.expressions.length

        while (--i) {
            this.pushOp('Expression', expr.expressions[i])
            this.pushOp('Ignore')
        }

        this.pushOp('Expression', expr.expressions[i])
    } else if (expr.type === 'UnaryExpression') {
        if (expr.operator !== 'delete') {
            this.pushOp('UnOp', expr.operator);
            this.pushOp('Expression', expr.argument);
        } else {
            if (expr.argument.type === 'MemberExpression') {
                this.pushOp('Del')
                this.pushOp('PointerCreate', expr.argument)
            } else {
                notimplemented('deleting ' + expr.argument.type);
            }
        }
    } else if (expr.type === 'BinaryExpression') {
        this.pushOp('BinOp', expr.operator)
        this.pushOp('Expression', expr.left)
        this.pushOp('Expression', expr.right)
    } else if (expr.type === 'UpdateExpression') {
        this.pushOp('Update', { operator: expr.operator, prefix: expr.prefix })
        this.pushOp('PointerCreate', expr.argument)
    } else if (expr.type === 'ConditionalExpression') {
        /* this is the same opcode as for if-statements, while-statements, case statements... */
        this.pushOp('Cond', expr);
    } else if (expr.type === 'Identifier') {
        this.stack.push(this.fetchVar(expr.name))
    } else if (expr.type === 'MemberExpression') {
        this.pushOp('PropGet', expr);
        this.pushOp('Expression', expr.object);
        if (expr.computed) {
            this.pushOp('Expression', expr.property);
        } else {
            this.stack.push(expr.property.name);
        }
    } else if (expr.type === 'ThisExpression') {
        this.stack.push(this.context)
    } else {
        notimplemented('expression type "' + expr.type + '"')
    }

    // TODO Remove this call when we're async
    return this._resolveSync();
};

ExecutionContext.prototype.pushOp = function (op, ast) {
    assert(op in ExecutionContext.ops, op + ' not in Execution.ops!')
    if (!this.ops) { this.ops = [] }
    this.ops.push([op, ast]);
}

ExecutionContext.ops = {
    'MaybeIdentifier': function (ast) {
        if (ast.type === 'Identifier') { this.stack.push(ast.name) }
        else if (ast.type === 'Literal') { this.stack.push(ast.value) }
        else { this.pushOp('Expression', ast) }
    },
    'Array': function (length) {
        var arr = new Array(length);
        while (length--) {
            arr[length] = this.stack.pop();
        }
        this.stack.push(arr)
    },
    'Object': function (length) {
        var obj = new Object()
        var value
        var key
        while (length--) {
            value = this.stack.pop()
            key = this.stack.pop()
            obj[key] = value
        }
        this.stack.push(obj)
    },
    'Ignore': function () {
        assert(this.stack.length, '"Ignore" op invoked on an empty stack!')
        this.stack.pop();
    },
    'Cond': function (ast) {
        this.pushOp('Cond2', ast)
        this.pushOp('Expression', ast.test)
    },
    'Cond2': function (ast) {
        var test = this.stack.pop();
        if (test) { this.pushOp('Expression', ast.consequent); }
        else if (ast.alternate) { this.pushOp('Expression', ast.alternate); }
        else { notimplemented() }
    },
    'Expression': function (ast) {
        var expr = this._evalExpression(ast)
        this.stack.push(expr);
    },
    'PropGet': function (ast) {
        var obj = this.stack.pop();
        var val = this.stack.pop();
        this.stack.push(obj[val]);
    },
    'Update': function(expr) {
        var pointer = this.stack.pop();

        assert(pointer instanceof Pointer, 'Update op must work on a Pointer instance')

        var original = pointer.getValue();

        var updated = expr.operator === '++' ?
            original + 1 :
            original - 1;

        pointer.setValue(updated);

        if (expr.prefix === false) {
            this.stack.push(original)
        } else {
            this.stack.push(updated)
        }
    },
    'PointerCreate': function (addr) {
        var obj;
        var prop;
        this.pushOp('PointerCreate2')
        if (addr.type === 'Identifier') {
            // TODO figure out why this is in reverse order from the "else" part.
            this.stack.push(addr.name)
            this.stack.push(this.findVarScope(addr.name))
        } else if (addr.type === 'MemberExpression') {
            this.pushOp('Expression', addr.object)
            this.pushOp('MaybeIdentifier', addr.property)
        } else {
            assert(false, 'Pointer must be created from Identifier or MemberExpression!')
        }
    },
    'PointerCreate2': function () {
        var obj = this.stack.pop()
        var prop = this.stack.pop()
        this.stack.push(new Pointer(obj, prop))
    },
    'PointerSet': function () {
        var pointer = this.stack.pop()
        assert(pointer instanceof Pointer, 'Update op must work on a Pointer instance')
        var right = this.stack.pop()
        this.stack.push(
            pointer.setValue(right))
    },
    'Del': function () {
        var pointer = this.stack.pop();
        assert(pointer instanceof Pointer, 'Update op must work on a Pointer instance')

        this.stack.push(pointer.deleteValue())
    },
    'UnOp': function (operator) {
        this.stack.push(this.sjedon.unaryExpression(operator, this.stack.pop()))
    },
    'BinOp': function (operator) {
        var left = this.stack.pop();
        var right = this.stack.pop();
        this.stack.push(this.sjedon.binaryExpression(operator, left, right));
    }
}

ExecutionContext.prototype._resolveSync = function () {
    var op;
    while (this.ops && this.ops.length) {
        op = this.ops.pop();
        // TODO peek stack, look for a completion (when this does statements) and return it
        ExecutionContext.ops[op[0]].call(this, op[1])
    }
    assert(this.stack.length === 1, 'stack length not 1! (was ' + this.stack.length + ')');
    return this.stack.pop();
}

ExecutionContext.prototype._evalCall = function (callee, context, args) {
    args = args || [];
    var func;

    if (callee.type === 'Identifier' || callee.type === 'MemberExpression') {
        if (callee.type === 'Identifier') {
            func = this.fetchVar(callee.name)
        } else {
            context = this._evalExpression(callee.object)
            func = context[this.maybeIdentifier(callee.property)];
        }
    } else if (callee.type === 'FunctionExpression' || callee.type === 'FunctionDeclaration') {
        func = this._evalExpression(callee);
        context = undefined;
    } else {
        notimplemented('calling functions other than FunctionExpression (given ' + callee.type + ')')
    }

    if (typeof func !== 'function') {
        throw new TypeError((func && func.toString()) + ' is not a function');
    }
    return func.apply(context, args);
}

ExecutionContext.prototype.maybeIdentifier = function (ast) {
    if (ast.type === 'Identifier') return ast.name
    if (ast.type === 'Literal') return ast.value
    else return this._evalExpression(ast);
}

Sjedon.prototype._evalFunctionCall = function (functionAST, closure, context, args) {
    var stackFrame = new Sjedon.ExecutionContext({
        sjedon: this,
        ast: functionAST,
        parent: this.currentFrame,
        closure: closure || null,
        context: context,
        arguments: args
    })

    this.currentFrame = stackFrame

    var ret = stackFrame._evalStatement(functionAST.body)

    this.currentFrame = stackFrame.parent

    if (isReturn(ret)) { return ret; }
}

ExecutionContext.prototype._evalFunction = function (func, closure) {
    if (this.sjedon.opt.functionLength) {
        notimplemented('returning Sjedon functions with the nonstandard length property');
    }

    var self = this;
    return function (_) {
        /* jshint unused:false */ // because that "_" parameter is to set "length" to 1
        return self.sjedon._evalFunctionCall(func, closure, this, arguments);
    }
}

}
