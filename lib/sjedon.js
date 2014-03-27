/*
 * sjedon
 * https://github.com/fabiosantoscode/sjedon
 *
 * Copyright (c) Fábio Santos 2014 
 * Licensed under the MIT license.
 */

'use strict';

var assert = require('assert')
var escope = require('escope')
var EventEmitter = require('events').EventEmitter;

var nothing = {};
var break_ = {};
var continue_ = {};

function notimplemented(feature) {
    throw new Error ('not implemented' + (feature ? ': ' + feature : ''));
}


Sjedon.StackFrame = StackFrame
function StackFrame(options) {
    var i, len;
    var sjedon = options.sjedon, ast = options.ast, parent = options.parent;
    assert(sjedon, 'Must pass reference to Sjedon')
    assert(ast, 'Must pass the AST with the function')
    assert(parent !== undefined, 'Parent argument mustn\'t be undefined.')
    assert(sjedon.getScope(ast), 'cannot add a stack frame to a ' + ast.type)

    this.ast = ast
    this.sjedon = sjedon
    this.context = 'context' in options ? options.context : null;
    this.closure = options.closure
    if (options.arguments instanceof Array) {
        var args = { length: options.arguments.length }
        for (i = 0; i < options.arguments.length; i++) {
            args[i] = options.arguments[i]
        }
        this.arguments = args
    } else if ('arguments' in options) {
        this.arguments = 'arguments' in options ? options.arguments : null;
    }

    var variables = this.variables = {}

    // Hoist variables to the top
    sjedon.scopeVariables(ast).forEach(function (name) {
        variables[name] = undefined;
    })

    for (i = 0, len = this.arguments ? this.arguments.length : 0; i < len && i < ast.params.length; i++) {
        assert(ast.params[i].type === 'Identifier', 'function arguments must be identifiers!');
        this.variables[ast.params[i].name] = this.arguments[i];
    }
    this.parent = parent
}

StackFrame.prototype.fetchVar = function (name, maybeNothing) {
    if (name === 'arguments' && this.arguments !== null) {
        return this.arguments;
    }

    // TODO allow people to assign to variables named "arguments"
    if (name in this.variables) {
        return this.variables[name]
    }

    if (this.closure) {
        var result = this.closure.fetchVar(name, true);
        if (result !== nothing) { return result; }
    }

    if (name in this.sjedon.global) {
        return this.sjedon.global[name];
    }
    if (maybeNothing) { return nothing_ }
    throw new ReferenceError(name + ' is not defined')
}
StackFrame.prototype.assignVar = function (name, value, maybeNothing) {
    if (name in this.variables) {
        return this.variables[name] = value;
    } else if (this.closure) {
        var result = this.closure.assignVar(name, value, true);
        if (result !== nothing) { return result; }
    }
    if (name in this.sjedon.global) {
        return this.sjedon.global[name] = value;
    }
    if (maybeNothing) { return nothing_ }
    throw new ReferenceError(name + ' is not defined')
}
StackFrame.prototype.trace = function () {
    var ret = [{ frame: this }]
    if (this.parent) { return this.parent.trace().concat(ret); }
    return ret;
}


function Sjedon(ast, options) {
    if (!(this instanceof Sjedon)) { return new Sjedon(ast); }
    this.ast = ast;
    this.scopeManager = escope.analyze(ast);
    this.scopeManager.attach(); // attach to AST
    this.globalFrame = new Sjedon.StackFrame({
        sjedon: this,
        ast: ast,
        closure: null,
        parent: null
    });
    this.opt = options || {};
    this.currentFrame = this.globalFrame
    this.global = (options && options.global) || {};
}

Sjedon.prototype = new EventEmitter()

Sjedon.prototype.makeFunction = function (func, closure) {  // TODO this "closure" argument means different things in different places.
    if (this.opt.functionLength) {
        notimplemented('returning Sjedon functions with the nonstandard length property');
    }

    var self = this;
    return function (_) {
        return self.runFunction(func, closure, this, arguments);
    }
}

Sjedon.prototype.addParents = function (ast) {
    for (var key in ast) if (ast.hasOwnProperty(key)) {
        if (typeof ast[key] === 'object' && ast[key] && !/^_/.test(key)) {
            ast[key]._parent = ast;
            this.addParents(ast[key]);
        }
    }
}

Sjedon.prototype.run = function (block) {
    this.evalBlock(block || this.ast.body);
}

Sjedon.prototype.evalBlock = function (body) {
    var ret = nothing;

    assert(body && typeof body.length === 'number', 'evalBlock: "' + body + '" is not an array of statements')

    for (var i = 0, len = body.length; i < len; i++) {
        ret = this.evalStatement(body[i])
        if (ret !== nothing) { return ret; }
    }

    return nothing;
}

Sjedon.prototype.evalStatement = function (statement) {
    if (statement.type === 'ExpressionStatement') {
        this.evalExpression(statement.expression);
        return nothing;
    } else if (statement.type === 'BlockStatement') {
        return this.evalBlock(statement.body);
    } else if (statement.type === 'ReturnStatement') {
        if (statement.argument !== null) {
            return this.evalExpression(statement.argument)
        }
        return nothing;
    } else if (statement.type === 'BreakStatement') {
        if (statement.label) { notimplemented('Labeled break statement'); }
        return break_;
    } else if (statement.type === 'ContinueStatement') {
        if (statement.label) { notimplemented('labelled continue statement') }
        return continue_;
    } else if (statement.type === 'IfStatement') {
        if (this.evalExpression(statement.test)) {
            return this.evalStatement(statement.consequent);
        } else if (statement.alternate) {
            return this.evalStatement(statement.alternate);
        } else {
            return nothing;
        }
    } else if (statement.type === 'SwitchStatement') {
        var discriminant = this.evalExpression(statement.discriminant);
        var kase;

        for (var i = 0, len = statement.cases.length; i < len; i++) {
            kase = statement.cases[i];
            assert(kase.type === 'SwitchCase');
            if (kase.test === null /* default: */ ||
                    this.evalExpression(kase.test) === discriminant) {
                break;
            }
        }

        for (;i < len; i++) {
            kase = statement.cases[i];
            var ret = this.evalBlock(kase.consequent);
            if (ret === nothing) {
                continue;
            } else if (ret === break_) {
                return nothing;
            } else if (ret === continue_) {
                continue;
            } else {
                return ret;
            }
        }

        return nothing;
    } else if (statement.type === 'ForStatement') {
        for (   statement.init   && this.evalStatement(statement.init);
                statement.test   ?  this.evalExpression(statement.test) : true;
                statement.update && this.evalExpression(statement.update)) {
            ret = this.evalStatement(statement.body);
            if (ret === break_) {
                return nothing;
            } else if (ret === continue_) {
                continue;
            } else if (ret !== nothing) {
                return ret;
            }
        }

        return nothing;
    } else if (statement.type === 'WhileStatement') {
        while (this.evalExpression(statement.test)) {
            ret = this.evalStatement(statement.body);
            if (ret === break_) {
                return nothing;
            } else if (ret === continue_) {
                continue;
            } else if (ret !== nothing) {
                return ret;
            }
        }

        return nothing;
    } else if (statement.type === 'DoWhileStatement') {
        do {
            ret = this.evalStatement(statement.body)
            if (ret === break_) {
                return nothing;
            } else if (ret === continue_) {
                continue;
            } else if (ret !== nothing) {
                return ret;
            }
        } while (this.evalExpression(statement.test))

        return nothing;
    } else if (statement.type === 'VariableDeclaration') {
        var self = this;
        statement.declarations.forEach(function (decl) {
            if (decl.init) {
                var initial = self.evalExpression(decl.init)
                self.currentFrame.assignVar(decl.id.name, initial);
            } // else, it's just a placeholder.
        })

        return nothing;
    } else if (statement.type === 'EmptyStatement') {
        return nothing;
    } else {
        notimplemented('statement "' + statement.type + '"');
    }
    assert(false, 'Sjedon#evalStatement must always return explicitly! If there is no "return", "break", or "throw", return a "nothing" reference');
};

Sjedon.prototype.arrayLiteral = function (contents) {
    return contents;
}

Sjedon.prototype.objectLiteral = function (props) {
    var ret = {};
    var len = props.length;
    while(len--) {
        ret[props[len][0]] = props[len][1];
    }
    return ret;
}

Sjedon.prototype.evalAssignment = function (expr) {
    var left = expr.left;
    var right = this.evalExpression(expr.right);
    if (left.type === 'Identifier') {
        return this.currentFrame.assignVar(left.name, right)
    } else if (left.type === 'MemberExpression') {
        if (left.property.type !== 'Identifier') {
            return this.evalExpression(left.object)[
                this.evalExpression(left.property)] = right
        } else {
            return this.evalExpression(left.object)[left.property.name] = right;
        }
    } else {
        notimplemented('Assigning to ' + left.type)
    }
}

Sjedon.prototype.unaryExpression = function (op, argument) {
    if (op === 'void') {
        return undefined;
    } else if (op === 'typeof') {
        return typeof argument;
    } else if (op === '-') {
        return -argument
    } else if (op === '+') {
        return +argument;
    } else if (op === '!') {
        return !argument;
    } else if (op === '~') {
        return ~argument;
    } else {
        notimplemented('unary operator ' + op);
    }
}

Sjedon.prototype.binaryExpression = function (op, left, right) {
    if (op === '+') {
        return left + right;
    } else if (op === '*') {
        return left * right;
    } else if (op === '-') {
        return left - right;
    } else if (op === '/') {
        return left / right;
    } else if (op === '%') {
        return left % right;
    } else if (op === '<') {
        return left < right;
    } else if (op === '>') {
        return left > right;
    } else if (op === '<=') {
        return left <= right;
    } else if (op === '>=') {
        return left >= right;
    } else if (op === '<<') {
        return left << right;
    } else if (op === '>>') {
        return left >> right;
    } else if (op === '>>>') {
        return left >>> right;
    } else if (op === 'instanceof') {
        return left instanceof right;
    } else if (op === 'in') {
        return left in right;
    } else if (op === '==') {
        return left == right;
    } else if (op === '!=') {
        return left != right;
    } else if (op === '===') {
        return left === right;
    } else if (op === '!==') {
        return left !== right;
    } else if (op === '&') {
        return left & right;
    } else if (op === '^') {
        return left ^ right;
    } else if (op === '|') {
        return left | right;
    } else if (op === '&&') {
        return left && right;
    } else if (op === '||') {
        return left || right;
    } else {
        notimplemented('binary operator ' + op);
    }
}

Sjedon.prototype.ternaryExpression = function (test, consequent, alternate) {
    return this.evalExpression(this.evalExpression(test) ? consequent : alternate)
}

Sjedon.prototype.propertyAccess = function (expr) {
    if (!expr.computed) {
        assert(expr.property.type === 'Identifier', 'computed access must be made to an identifier property');
        return this.evalExpression(expr.object)[expr.property.name];
    } else {
        return this.evalExpression(expr.object)['' + this.evalExpression(expr.property)];
    }
}

Sjedon.prototype.propertyDelete = function (obj, prop) {
    delete obj[prop];
    return true;
}

Sjedon.prototype.maybeIdentifier = function (ast) {
    if (ast.type === 'Identifier') return ast.name
    if (ast.type === 'Literal') return ast.value
    else return this.evalExpression(ast);
}


// Returns an expression which evaluates to itself.
// Useful for i++ (we need to eval something twice but don't
// want the side effects so we eval the real thing, and then eval a SjedonQuotedExpression)
Sjedon.prototype.quote = function (thing) {
    return {
        type: 'SjedonQuotedExpression',
        value: thing
    }
}

Sjedon.prototype.evalExpression = function (expr) {
    assert(expr && expr.type, 'Sjedon#evalExpression: pass an expression! (given: ' + typeof expr + '"' + expr + '".')
    if (expr.type === 'SjedonQuotedExpression') {
        // See Sjedon#quote()
        return expr.value;
    } else if (expr.type === 'CallExpression') {
        return this.evalCall(expr.callee, undefined, expr['arguments'].map(this.evalExpression.bind(this)));
    } else if (expr.type === 'Literal') {
        return expr.value;
    } else if (expr.type === 'ArrayExpression') {
        return this.arrayLiteral(
            expr.elements.map(this.evalExpression.bind(this)))
    } else if (expr.type === 'ObjectExpression') {
        var self = this;
        return this.objectLiteral(expr.properties.map(function (prop) {
            return [
                self.maybeIdentifier(prop.key),
                self.evalExpression(prop.value)
            ];
        }))
    } else if (expr.type === 'FunctionExpression') {
        return this.makeFunction(expr, this.currentFrame);
    } else if (expr.type === 'AssignmentExpression') {
        return this.evalAssignment(expr);
    } else if (expr.type === 'SequenceExpression') {
        for (var i = 0; i < expr.expressions.length - 1; i++) {
            this.evalExpression(expr.expressions[i])
        }
        return this.evalExpression(expr.expressions[i]);
    } else if (expr.type === 'UnaryExpression') {
        if (expr.operator !== 'delete') {
            return this.unaryExpression(expr.operator, this.evalExpression(expr.argument));
        } else {
            if (expr.argument.type === 'MemberExpression') {
                return this.propertyDelete(
                    this.evalExpression(expr.argument.object),
                    this.maybeIdentifier(expr.argument.property));
            } else {
                notimplemented('deleting ' + expr.argument.type);
            }
        }
    } else if (expr.type === 'BinaryExpression') {
        return this.binaryExpression(expr.operator,
            this.evalExpression(expr.left),
            this.evalExpression(expr.right));
    } else if (expr.type === 'UpdateExpression') {
        var original = this.evalExpression(expr.argument);

        var updated = expr.operator === '++' ?
            original + 1 :
            original - 1;

        this.evalAssignment({
            left: expr.argument,
            right: this.quote(updated)
        });

        if (expr.prefix === false) {
            return original;
        } else {
            return updated;
        }
    } else if (expr.type === 'ConditionalExpression' ) {
        return this.ternaryExpression(expr.test, expr.consequent, expr.alternate);
    } else if (expr.type === 'Identifier') {
        return this.currentFrame.fetchVar(expr.name)
    } else if (expr.type === 'MemberExpression') {
        return this.propertyAccess(expr)
    } else {
        notimplemented('expression type "' + expr.type + '"')
    }
};

Sjedon.prototype.evalCall = function (callee, context, args) {
    args = args || [];
    var func;

    if (callee.type === 'Identifier' || callee.type === 'MemberExpression') {
        if (callee.type === 'Identifier') {
            func = this.currentFrame.fetchVar(callee.name)
        } else {
            context = this.evalExpression(callee.object)
            func = context[this.maybeIdentifier(callee.property)];
        }
    } else if (callee.type === 'FunctionExpression' || callee.type === 'FunctionDeclaration') {
        func = this.evalExpression(callee);
        context = undefined;
    } else {
        notimplemented('calling functions other than FunctionExpression (given ' + callee.type + ')')
    }

    assert(typeof func === 'function', func + ' is not a function!')  // TODO real exception
    return func.apply(context, args);
}

Sjedon.prototype.runFunction = function (functionAST, closure, context, args) {
    var stackFrame = new Sjedon.StackFrame({
        sjedon: this,
        ast: functionAST,
        parent: this.currentFrame,
        closure: closure || null,
        context: context,
        arguments: args
    })

    this.currentFrame = stackFrame

    var ret = this.evalStatement(functionAST.body)

    this.currentFrame = stackFrame.parent

    return ret === nothing ?
        undefined :
        ret;
}

// TODO these funcs seem to be unused. Ditch them.
Sjedon.prototype.findScope = function (funcNode, name) {
    assert(funcNode && name, 'findScope arguments incomplete')
    var scope = this.getScope(funcNode)
    function findName(variable) { return variable.name === name }
    while (scope) {
        if (scope.variables.some(findName)) {
            return scope.block;
        }
        scope = scope.upper
    }
    return null
}

// TODO these funcs seem to be unused. Ditch them.
Sjedon.prototype.getScope = function (astNode) {
    return astNode[escope.Scope.mangledName]
}

// TODO these funcs seem to be unused. Ditch them.
Sjedon.prototype.scopeVariables = function (astNode) {
    return this.getScope(astNode)
        .variables
        .map(function(v) { return v.name })
}

Sjedon.prototype.trace = function () {
    return this.currentFrame.trace()
}

// TODO these funcs seem to be unused. Ditch them.
Sjedon.prototype.fetchVar = function (name) {
    return this.currentFrame.fetchVar(name);
}

module.exports = Sjedon;

