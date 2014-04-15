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

Sjedon.nothing = {};
Sjedon.break_ = {};
Sjedon.continue_ = {};

function notimplemented(feature) {
    throw new Error ('not implemented' + (feature ? ': ' + feature : ''));
}

Sjedon.ExecutionContext = ExecutionContext
function ExecutionContext(options) {
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

ExecutionContext.prototype.findVarScope = function (name) {
    if (name in this.variables) {
        return this.variables
    } else if (this.closure) {
        var result = this.closure.findVarScope(name);
        if (result) { return result; }
    }
    if (name in this.sjedon.global) {
        return this.sjedon.global
    }
}

ExecutionContext.prototype.assignVar = function (name, value, maybeNothing) {
    var scope = this.findVarScope(name);
    if (scope) {
        return scope[name] = value
    }
    throw new ReferenceError(name + ' is not defined')
}

ExecutionContext.prototype.fetchVar = function (name, maybeNothing) {
    var scope = this.findVarScope(name);
    if (scope) {
        return scope[name]
    }
    throw new ReferenceError(name + ' is not defined')
}

ExecutionContext.prototype.declareVar = function (name, value) {
    if (!(name in this.variables)) { this.variables[name] = undefined; }
    this.assignVar(name, value);
}
ExecutionContext.prototype.trace = function () {
    var ret = [{ frame: this }]
    if (this.parent) { return this.parent.trace().concat(ret); }
    return ret;
}


function Sjedon(ast, options) {
    if (!(this instanceof Sjedon)) { return new Sjedon(ast); }
    this.ast = ast;
    this.scopeManager = escope.analyze(ast);
    this.scopeManager.attach(); // attach to AST
    this.globalFrame = new Sjedon.ExecutionContext({
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

Sjedon.prototype.addParents = function (ast) {
    for (var key in ast) if (ast.hasOwnProperty(key)) {
        if (typeof ast[key] === 'object' && ast[key] && !/^_/.test(key)) {
            ast[key]._parent = ast;
            this.addParents(ast[key]);
        }
    }
}

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



// Shiny public API

Sjedon.prototype.eval = function (block) {
    this.stack = [];
    return this._eval(block || this.ast.body);
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
        /* jshint eqeqeq:false */
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

Sjedon.prototype.propertyDelete = function (obj, prop) {
    delete obj[prop];
    return true;
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

// Install the eval subsystem, whose constructor lives in ./sjedon-eval.js
require('./sjedon-eval.js')(Sjedon, ExecutionContext)

module.exports = Sjedon;

