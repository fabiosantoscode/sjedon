/*
 * sjedon
 * https://github.com//sjedon
 *
 * Copyright (c) 2014 
 * Licensed under the MIT license.
 */

'use strict';

var EventEmitter = require('events').EventEmitter;

function notimplemented(feature) { throw new Error ('not implemented' + (feature ? ': ' + feature : '')); }

function Sjedon(ast) {
    if (!(this instanceof Sjedon)) { return new Sjedon(ast); }
    this.ast = ast;
}

Sjedon.prototype = new EventEmitter();

Sjedon.prototype.run = function () {
    this.ast.body.forEach(this.evalStatement.bind(this));
};

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

        for (var i = 0, len = body.length; i < len; i++) {
            if (body[i].type === 'BlockStatement') {
                notimplemented('block statement')
                ret = runBlock.call(this, body[i]);
                if (ret !== noReturn) {
                    return ret;
                }
            } else if (body[i].type === 'ReturnStatement') {
                return this.evalExpression(body[i].argument)
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

module.exports = Sjedon;

