/*
 * sjedon
 * https://github.com//sjedon
 *
 * Copyright (c) 2014 
 * Licensed under the MIT license.
 */

'use strict';

var escope = require('escope')
var EventEmitter = require('events').EventEmitter;

var nothing = {};

function notimplemented(feature) {
    throw new Error ('not implemented' + (feature ? ': ' + feature : ''));
}

function Sjedon(ast) {
    if (!(this instanceof Sjedon)) { return new Sjedon(ast); }
    this.ast = ast;
    this.scopeManager = escope.analyze(ast);
    this.scopeManager.attach(); // attach to AST
    this.stack = [];
}

Sjedon.mangledName = '__$sjedon__'

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
        return typeof this.evalExpression(argument);
    }
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
            var key = prop.key.type === 'Identifier' ?
                prop.key.name :
                this.evalExpression(prop.key);
            return [key, this.evalExpression(prop.value)];
        }.bind(this)))
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
    if (callee.type === 'FunctionExpression') {
        return this.runFunction(callee);
    } else {
        notimplemented('calling functions other then FunctionExpression (given ' + callee.type + ')')
    }
}

Sjedon.prototype.runFunction = function (functionAST) {
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
    return ret === noReturn ?
        undefined :
        ret;
}

Sjedon.prototype.getScope = function (astNode) {
    return astNode[escope.Scope.mangledName]
}

Sjedon.prototype.scopeVariables = function (astNode) {
    return this.getScope(astNode)
        .variables
        .map(function(v) { return v.name })
}

module.exports = Sjedon;

