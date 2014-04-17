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

ExecutionContext.prototype._evalAssignment = function (expr) {
    var left = expr.left;
    var right = this._evalExpression(expr.right);
    if (left.type === 'Identifier') {
        return this.assignVar(left.name, right)
    } else if (left.type === 'MemberExpression') {
        if (left.property.type !== 'Identifier') {
            return this._evalExpression(left.object)[
                this._evalExpression(left.property)] = right
        } else {
            return this._evalExpression(left.object)[left.property.name] = right;
        }
    } else {
        notimplemented('Assigning to ' + left.type)
    }
}

ExecutionContext.prototype._evalTernaryExpression = function (test, consequent, alternate) {
    return this._evalExpression(this._evalExpression(test) ? consequent : alternate)
}

ExecutionContext.prototype._evalPropertyAccess = function (expr) {
    if (!expr.computed) {
        assert(expr.property.type === 'Identifier', 'computed access must be made to an identifier property');
        return this._evalExpression(expr.object)[expr.property.name];
    } else {
        return this._evalExpression(expr.object)['' + this._evalExpression(expr.property)];
    }
}

ExecutionContext.prototype._evalExpression = function (expr) {
    assert(expr && expr.type, 'Sjedon#_evalExpression: pass an expression! (given: ' + typeof expr + '"' + expr + '".')
    if (expr.type === 'SjedonQuotedExpression') {
        // See Sjedon#quote()
        return expr.value;
    } else if (expr.type === 'CallExpression') {
        return this._evalCall(expr.callee, undefined, expr['arguments'].map(this._evalExpression.bind(this)));
    } else if (expr.type === 'NewExpression') {
        var callee = this._evalExpression(expr.callee);
        var newObj = inheritFrom(callee.prototype || {});
        callee.apply(newObj, expr['arguments'].map(this._evalExpression.bind(this)))
        return newObj;
    } else if (expr.type === 'Literal') {
        return expr.value;
    } else if (expr.type === 'ArrayExpression') {
        return this.sjedon.arrayLiteral(
            expr.elements.map(this._evalExpression.bind(this)))
    } else if (expr.type === 'ObjectExpression') {
        var self = this;
        return this.sjedon.objectLiteral(expr.properties.map(function (prop) {
            return [
                self.maybeIdentifier(prop.key),
                self._evalExpression(prop.value)
            ];
        }))
    } else if (expr.type === 'FunctionExpression' || expr.type === 'FunctionDeclaration') {
        return this._evalFunction(expr, this /* TODO this is already the context */);
    } else if (expr.type === 'AssignmentExpression') {
        return this._evalAssignment(expr);
    } else if (expr.type === 'SequenceExpression') {
        for (var i = 0; i < expr.expressions.length - 1; i++) {
            this._evalExpression(expr.expressions[i])
        }
        return this._evalExpression(expr.expressions[i]);
    } else if (expr.type === 'UnaryExpression') {
        if (expr.operator !== 'delete') {
            return this.sjedon.unaryExpression(expr.operator, this._evalExpression(expr.argument));
        } else {
            if (expr.argument.type === 'MemberExpression') {
                return this.sjedon.propertyDelete(
                    this._evalExpression(expr.argument.object),
                    this.maybeIdentifier(expr.argument.property));
            } else {
                notimplemented('deleting ' + expr.argument.type);
            }
        }
    } else if (expr.type === 'BinaryExpression') {
        return this.sjedon.binaryExpression(expr.operator,
            this._evalExpression(expr.left),
            this._evalExpression(expr.right));
    } else if (expr.type === 'UpdateExpression') {
        var original = this._evalExpression(expr.argument);

        var updated = expr.operator === '++' ?
            original + 1 :
            original - 1;

        this._evalAssignment({
            left: expr.argument,
            right: this.sjedon.quote(updated)
        });

        if (expr.prefix === false) {
            return original;
        } else {
            return updated;
        }
    } else if (expr.type === 'ConditionalExpression' ) {
        return this._evalTernaryExpression(expr.test, expr.consequent, expr.alternate);
    } else if (expr.type === 'Identifier') {
        return this.fetchVar(expr.name)
    } else if (expr.type === 'MemberExpression') {
        return this._evalPropertyAccess(expr)
    } else if (expr.type === 'ThisExpression') {
        return this.context;
    } else {
        notimplemented('expression type "' + expr.type + '"')
    }
};

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
