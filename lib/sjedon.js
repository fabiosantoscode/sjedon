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

function notimplemented(feature) {
    throw new Error ('not implemented' + (feature ? ': ' + feature : ''));
}

Sjedon.StackFrame = StackFrame
function StackFrame(options) {
    var sjedon = options.sjedon, ast = options.ast, parent = options.parent;
    assert(sjedon, 'Must pass reference to Sjedon')
    assert(ast, 'Must pass the AST with the function')
    assert(parent !== undefined, 'Parent argument mustn\'t be undefined.')
    assert(sjedon.getScope(ast), 'cannot add a stack frame to a ' + ast.type)

    this.ast = ast
    this.sjedon = sjedon

    var variables = this.variables = {}
    sjedon.scopeVariables(ast).forEach(function (name) {
        variables[name] = undefined;
    })
    this.parent = parent
}

StackFrame.prototype.fetchVar = function (name) {
    if (name in this.variables) {
        return this.variables[name]
    } else if (this.parent) {
        return this.parent.fetchVar(name)
    } else if (name in this.sjedon.global) {
        return this.sjedon.global[name];
    }
    throw new Error('variable "' + name + '" not found')
}
StackFrame.prototype.assignVar = function (name, value) {
    if (name in this.variables) {
        return this.variables[name] = value;
    } else if (this.parent) {
        return this.parent.assignVar(name, value)
    }
    throw new Error('undefined reference: ' + value)
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
        parent: null
    });
    this.currentFrame = this.globalFrame
    this.global = (options && options.global) || {};
}

Sjedon.prototype = new EventEmitter()

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
        return this.evalExpression(statement.expression);
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
            } else {
                return ret;
            }
        }

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

Sjedon.prototype.unaryExpression = function (op, argument) {
    if (op === 'void') {
        return undefined;
    } else if (op === 'typeof') {
        return typeof argument;
    } else {
        notimplemented('unary operator ' + op);
    }
}

Sjedon.prototype.binaryExpression = function (op, left, right) {
    if (op === 'in') {
        return left in right;
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

Sjedon.prototype.evalObjectKey = function (key) {
    if (key.type === 'Identifier') return key.name
    if (key.type === 'Literal') return key.value

    assert(key.type);
    assert(false, 'unsupported object key: ' + key.type);
}

Sjedon.prototype.evalExpression = function (expr) {
    if (expr.type === 'CallExpression') {
        return this.callFunction(expr.callee);
    } else if (expr.type === 'Literal') {
        return expr.value;
    } else if (expr.type === 'ArrayExpression') {
        return this.arrayLiteral(
            expr.elements.map(this.evalExpression.bind(this)))
    } else if (expr.type === 'ObjectExpression') {
        var self = this;
        return this.objectLiteral(expr.properties.map(function (prop) {
            return [
                self.evalObjectKey(prop.key),
                self.evalExpression(prop.value)
            ];
        }))
    } else if (expr.type === 'AssignmentExpression') {
        return this.currentFrame.assignVar(expr.left.name,
            this.evalExpression(expr.right))
    } else if (expr.type === 'SequenceExpression') {
        for (var i = 0; i < expr.expressions.length - 1; i++) {
            this.evalExpression(expr.expressions[i])
        }
        return this.evalExpression(expr.expressions[i]);
    } else if (expr.type === 'UnaryExpression') {
        return this.unaryExpression(expr.operator, this.evalExpression(expr.argument));
    } else if (expr.type === 'BinaryExpression') {
        return this.binaryExpression(expr.operator,
            this.evalExpression(expr.left),
            this.evalExpression(expr.right));
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

Sjedon.prototype.callFunction = function (callee) {
    if (callee.type === 'Identifier') {
        var func = this.currentFrame.fetchVar(callee.name)
        assert(func)
        if (typeof func === 'function') {
            func(null);  // TODO arguments, context
        } else {
            this.runFunction(func)
        }
    } else if (callee.type === 'FunctionExpression' || callee.type === 'FunctionDeclaration') {
        return this.runFunction(callee);
    } else {
        notimplemented('calling functions other than FunctionExpression (given ' + callee.type + ')')
    }
}

Sjedon.prototype.runFunction = function (functionAST) {
    var stackFrame = new Sjedon.StackFrame({
        sjedon: this,
        ast: functionAST,
        parent: this.currentFrame
    })

    this.currentFrame = stackFrame

    var ret = this.evalStatement(functionAST.body)

    this.currentFrame = stackFrame.parent

    return ret === nothing ?
        undefined :
        ret;
}

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

Sjedon.prototype.getScope = function (astNode) {
    return astNode[escope.Scope.mangledName]
}

Sjedon.prototype.scopeVariables = function (astNode) {
    return this.getScope(astNode)
        .variables
        .map(function(v) { return v.name })
}

Sjedon.prototype.trace = function () {
    return this.currentFrame.trace()
}

Sjedon.prototype.fetchVar = function (name) {
    return this.currentFrame.fetchVar(name);
}

module.exports = Sjedon;

