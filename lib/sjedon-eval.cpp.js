'use strict';

var assert = require('assert')

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

ExecutionContext.prototype._eval = function (ast) {
    return this._evalBlock(ast);
}

ExecutionContext.prototype._evalBlock = function (body) {
    return this._evalMain(body, 'block')
}

ExecutionContext.prototype._evalExpression = function (expr) {
    return this._evalMain(expr, null);
}

ExecutionContext.prototype._evalStatement = function (statement) {
    return this._evalMain(statement, null);
}

ExecutionContext.prototype._evalMain = function (ast, helper) {
    var ret;
    var self = this;
    var i;

    var toSwitch = helper || ast.type;

    switch(toSwitch) {
    case 'block':
        var ret = Sjedon.nothing;

        assert(ast && typeof ast.length === 'number', '_evalBlock: "' + ast + '" is not an array of statements')

        for (var i = 0, len = ast.length; i < len; i++) {
            ret = this._evalStatement(ast[i])
            if (ret !== Sjedon.nothing) { return ret; }
        }

        return Sjedon.nothing;

    case 'assignment':
        var left = ast.left;
        var right = this._evalExpression(ast.right);
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

    case 'function':
        if (this.sjedon.opt.functionLength) {
            notimplemented('returning Sjedon functions with the nonstandard length property');
        }

        var self = this;
        return function (_) {
            /* jshint unused:false */ // because that "_" parameter is to set "length" to 1
            return self.sjedon._evalFunctionCall(ast.func, ast.closure, this, arguments);
        }

    case 'call':
        ast.args = ast.args || [];
        var func;

        if (ast.callee.type === 'Identifier' || ast.callee.type === 'MemberExpression') {
            if (ast.callee.type === 'Identifier') {
                func = this.fetchVar(ast.callee.name)
            } else {
                ast.context = this._evalExpression(ast.callee.object)
                func = ast.context[this._evalMain(ast.callee.property, 'maybeidentifier')];
            }
        } else if (ast.callee.type === 'FunctionExpression' || ast.callee.type === 'FunctionDeclaration') {
            func = this._evalExpression(ast.callee);
            ast.context = undefined;
        } else {
            notimplemented('calling functions other than FunctionExpression (given ' + ast.callee.type + ')')
        }

        if (typeof func !== 'function') {
            throw new TypeError((func && func.toString()) + ' is not a function');
        }
        return func.apply(ast.context, ast.args);

    case 'maybeidentifier':
        if (ast.type === 'Identifier') return ast.name
        if (ast.type === 'Literal') return ast.value
        else return this._evalExpression(ast);

    case 'ExpressionStatement':
        this._evalExpression(ast.expression);
        return Sjedon.nothing;
    case 'BlockStatement':
        return this._evalBlock(ast.body);
    case 'ReturnStatement':
        if (ast.argument !== null) {
            return this._evalExpression(ast.argument)
        }
        return Sjedon.nothing;
    case 'BreakStatement':
        if (ast.label) { notimplemented('Labeled break statement'); }
        return Sjedon.break_;
    case 'ContinueStatement':
        if (ast.label) { notimplemented('labelled continue statement') }
        return Sjedon.continue_;
    case 'IfStatement':
        if (this._evalExpression(ast.test)) {
            return this._evalStatement(ast.consequent);
        } else if (ast.alternate) {
            return this._evalStatement(ast.alternate);
        } else {
            return Sjedon.nothing;
        }
    case 'SwitchStatement':
        var discriminant = this._evalExpression(ast.discriminant);
        var kase;

        for (i = 0; i < ast.cases.length; i++) {
            kase = ast.cases[i];
            assert(kase.type === 'SwitchCase');
            if (kase.test === null /* default: */ ||
                    this._evalExpression(kase.test) === discriminant) {
                break;
            }
        }

        for (;i < ast.cases.length; i++) {
            kase = ast.cases[i];
            ret = this._evalBlock(kase.consequent);
            if (isReturn(ret)) { return ret; }
        }

        return Sjedon.nothing;
    case 'ForStatement':
        for (   ast.init   && this._evalStatement(ast.init);
                ast.test   ?  this._evalExpression(ast.test) : true;
                ast.update && this._evalExpression(ast.update)) {
            ret = this._evalStatement(ast.body);
            if (isReturn(ret)) { return ret; }
            if (ret === Sjedon.break_) {
                return Sjedon.nothing;
            }
        }

        return Sjedon.nothing;
    case 'WhileStatement':
        while (this._evalExpression(ast.test)) {
            ret = this._evalStatement(ast.body);
            if (isReturn(ret)) { return ret; }
            if (ret === Sjedon.break_) {
                return Sjedon.nothing;
            }
        }

        return Sjedon.nothing;
    case 'DoWhileStatement':
        do {
            ret = this._evalStatement(ast.body)
            if (isReturn(ret)) { return ret; }
            if (ret === Sjedon.break_) {
                return Sjedon.nothing;
            }
        } while (this._evalExpression(ast.test))

        return Sjedon.nothing;
    case 'VariableDeclaration':
        ast.declarations.forEach(function (decl) {
            if (decl.init) {
                var initial = self._evalExpression(decl.init)
                self.declareVar(decl.id.name, initial);
            } // else, it's just a placeholder.
        })

        return Sjedon.nothing;
    case 'FunctionDeclaration':
        // TODO just this won't do for calling functions before they are declared!
        this.assignVar(ast.id.name, this._evalExpression(ast))
        return Sjedon.nothing;
    case 'EmptyStatement':
        return Sjedon.nothing;

    /**
     * Expressions
     **/
    case 'SjedonQuotedExpression':
        // See Sjedon#quote()
        return ast.value;
    case 'CallExpression':
        return this._evalMain({ callee: ast.callee, context: undefined, args: ast['arguments'].map(this._evalExpression.bind(this)) }, 'call');
    case 'NewExpression':
        var callee = this._evalExpression(ast.callee);
        var newObj = inheritFrom(callee.prototype || {});
        callee.apply(newObj, ast['arguments'].map(this._evalExpression.bind(this)))
        return newObj;
    case 'Literal':
        return ast.value;
    case 'ArrayExpression':
        return this.sjedon.arrayLiteral(
            ast.elements.map(this._evalExpression.bind(this)))
    case 'ObjectExpression':
        return this.sjedon.objectLiteral(ast.properties.map(function (prop) {
            return [
                self._evalMain(prop.key, 'maybeidentifier'),
                self._evalExpression(prop.value)
            ];
        }))
    case 'FunctionExpression': case 'FunctionDeclaration':
        return this._evalMain({ func: ast, closure: this }, 'function');
    case 'AssignmentExpression':
        return this._evalMain(ast, 'assignment')
    case 'SequenceExpression':
        for (i = 0; i < ast.expressions.length - 1; i++) {
            this._evalExpression(ast.expressions[i])
        }
        return this._evalExpression(ast.expressions[i]);
    case 'UnaryExpression':
        if (ast.operator !== 'delete') {
            return this.sjedon.unaryExpression(ast.operator, this._evalExpression(ast.argument));
        } else {
            if (ast.argument.type === 'MemberExpression') {
                return this.sjedon.propertyDelete(
                    this._evalExpression(ast.argument.object),
                    this._evalMain(ast.argument.property, 'maybeidentifier'))
            } else {
                notimplemented('deleting ' + ast.argument.type);
            }
        }
    case 'BinaryExpression':
        return this.sjedon.binaryExpression(ast.operator,
            this._evalExpression(ast.left),
            this._evalExpression(ast.right));
    case 'UpdateExpression':
        var original = this._evalExpression(ast.argument);

        var updated = ast.operator === '++' ?
            original + 1 :
            original - 1;

        this._evalMain({
            left: ast.argument,
            right: this.sjedon.quote(updated)
        }, 'assignment')

        if (ast.prefix === false) {
            return original;
        } else {
            return updated;
        }
    case 'ConditionalExpression':
        return this._evalExpression(this._evalExpression(ast.test) ? ast.consequent : ast.alternate)
    case 'Identifier':
        return this.fetchVar(ast.name)
    case 'MemberExpression':
        if (!ast.computed) {
            assert(ast.property.type === 'Identifier', 'computed access must be made to an identifier property');
            return this._evalExpression(ast.object)[ast.property.name];
        } else {
            return this._evalExpression(ast.object)['' + this._evalExpression(ast.property)];
        }
    case 'ThisExpression':
        return this.context;

    }

    notimplemented('Evaluation of AST node type "' + ast.type + '"')
};

ExecutionContext.prototype._evalCall = function (callee, context, args) {
    return this._evalMain({ callee: callee, context: context, args: args }, 'call')
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

}
