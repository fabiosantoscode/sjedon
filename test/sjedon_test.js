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

function aSjedon(ast) {
    if (typeof ast === 'string') {
        ast = esprima.parse(ast);
    }
    return new Sjedon(ast);
}
function evalExpr(expr) {
    var sjedon = new Sjedon(esprima.parse(expr));
    return sjedon.evalExpression(sjedon.ast.body[0].expression);
}

describe('code:', function () {
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
    it('functions return undefined by default', function () {
        var sjedon = aSjedon('(function () { return; })');
        var result = sjedon.callFunction(sjedon.ast.body[0].expression);
        ok.equal(result, undefined);
        ok.equal(typeof result, 'undefined');

        sjedon = aSjedon('(function () { })');
        result = sjedon.callFunction(sjedon.ast.body[0].expression);
        ok.equal(result, undefined);
        ok.equal(typeof result, 'undefined');
    });
})

xdescribe('var scope', function () {
    it('we can access variables within this function', function () {
        evalExpr('(function () {' +
            'var x = 1;' +
            'var y;' +
            'return [x, y]' +
        '}())');
    });
    it('and arguments', function () {
        ok.strictEqual(evalExpr('(function(a){return a;}(1))'), 1);
    });
});

