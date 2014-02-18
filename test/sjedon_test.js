/* globals describe:false, it:false, beforeEach: false */
'use strict';

var ok = require('assert')
var sinon = require('sinon')
var esprima = require('esprima')
var Sjedon = require('../lib/sjedon.js')

describe('Sjedon class', function () {
    it('Can be called or new\'d. Result is always a Sjedon instance', function() {
        /* jshint newcap:false */
        // tests here
        var called = Sjedon()
        var newed = new Sjedon()
        ok(called instanceof Sjedon)
        ok(newed instanceof Sjedon)
    })
})

describe('code:', function () {
    function aSjedon(ast) {
        if (typeof ast === 'string') {
            ast = esprima.parse(ast);
        }
        return new Sjedon(ast);
    }
    function evalExpr(expr) {
        var sjedon = aSjedon(expr);
        return sjedon.evalExpression(sjedon.ast.body[0].expression);
    }
    describe('literals:', function () {
        it('basic', function () {
            ok.strictEqual(evalExpr('3'), 3);
            ok.strictEqual(evalExpr('"3"'), "3");
        });
        it('recursive', function () {
            ok.deepEqual(evalExpr('[1,2,3]'), [1,2,3]);
            ok.deepEqual(evalExpr('({ a: 1, b: 2 })'), { a: 1, b: 2});
        });
    });
    describe('operators:', function () {
        it('comma', function () {
            ok.equal(evalExpr('1,2,3'), 3);
        });
    });
    describe('unary operators', function () {
        it('void', function () {
            ok.strictEqual(evalExpr('void 1', undefined));
            ok.strictEqual(evalExpr('void 1', undefined));
        })
    });
    it('functions and returns', function () {
        var sjedon = aSjedon('(function () { return 3; })');
        var result = sjedon.callFunction(sjedon.ast.body[0].expression);
        ok.equal(result, 3);
        ok.equal(typeof result, 'number');
    });
})

describe('contexts:', function () {
    
})
