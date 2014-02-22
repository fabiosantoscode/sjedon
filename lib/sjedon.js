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

function notimplemented(feature) {
    throw new Error ('not implemented: ' + (feature ? ': ' + feature : ''));
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
        variables['!' + name] = undefined;
    })
    this.parent = parent
}

StackFrame.prototype.fetchVar = function (name) {
    if (('!' + name) in this.variables) {
        return this.variables['!' + name]
    } else if (this.parent) {
        return this.parent.fetchVar(name)
    }
    throw new Error('variable "' + name + '" not found')
}
StackFrame.prototype.assignVar = function (name, value) {
    if (('!' + name) in this.variables) {
        return this.variables['!' + name] = value;
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


function Sjedon(ast) {
    if (!(this instanceof Sjedon)) { return new Sjedon(ast); }
    this.ast = ast;
    this.scopeManager = escope.analyze(ast);
    this.scopeManager.attach(); // attach to AST
    this.globalFrame = new Sjedon.StackFrame({
        sjedon: this,
        ast: ast,
        parent: null
    });
    this.currentFrame = null
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

Sjedon.prototype.run = function () {
    this.ast.body.forEach(this.evalStatement.bind(this));
}

Sjedon.prototype.evalStatement = function (statement) {
    if (statement.type === 'ExpressionStatement') {
        return this.evalExpression(statement.expression);
    } else if (statement.type === 'VariableDeclaration') {
        var self = this;
        statement.declarations.forEach(function (decl) {
            if (decl.init) {
                var initial = self.evalExpression(decl.init)
                self.currentFrame.assignVar(decl.id.name, initial);
            } // else, it's just a placeholder.
        })
    } else {
        notimplemented('statement "' + statement.type + '"');
    }
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
        this.evalExpression(argument);
        return undefined;
    } else if (op === 'typeof') {
        var operand = this.evalExpression(argument);
        return typeof operand;
    }
}

Sjedon.prototype.evalObjectKey = function (key) {
    if (key.type === 'Identifier') return key.name
    if (key.type === 'Literal') return key.value

    assert(key.type), assert(false, 'unsupported object key: ' + key.type);
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
        return this.objectLiteral(expr.properties.map(function (prop) {
            return [
                this.evalObjectKey(prop.key),
                this.evalExpression(prop.value)
            ];
        }.bind(this)))
    } else if (expr.type === 'AssignmentExpression') {
        this.currentFrame.assignVar(expr.left.name,
            this.evalExpression(expr.right))
    } else if (expr.type === 'SequenceExpression') {
        for (var i = 0; i < expr.expressions.length - 1; i++) {
            this.evalExpression(expr.expressions[i])
        }
        return this.evalExpression(expr.expressions[i]);
    } else if (expr.type === 'UnaryExpression') {
        return this.unaryExpression(expr.operator, expr.argument);
    } else {
        notimplemented('expression type "' + expr.type + '"')
    }
};

Sjedon.prototype.callFunction = function (callee) {
    if (callee.type === 'Identifier') {
        console.log(this.currentFrame)
        console.log(callee)
        var func = this.currentFrame.fetchVar(callee.name)
        assert(func)
        this.runFunction(func)
    } else if (callee.type === 'FunctionExpression') {
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

    var noReturn = {};
    function runBlock(body) {
        var ret = noReturn;

        if (body.length === 0) return noReturn;

        for (var i = 0, len = body.length; i < len; i++) {
            if (body[i].type === 'BlockStatement') {
                notimplemented('block statement')
                ret = runBlock.call(this, body[i]);
                if (ret !== noReturn) {
                    return ret;
                }
            } else if (body[i].type === 'ReturnStatement') {
                if (body[i].argument !== null) {
                    return this.evalExpression(body[i].argument)
                }
                return noReturn;
            } else {
                this.evalStatement(body[i]);
            }
        }

        return ret;
    }

    var ret = runBlock.call(this, functionAST.body.body);
    this.currentFrame = stackFrame.parent

    return ret === noReturn ?
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

module.exports = Sjedon;

