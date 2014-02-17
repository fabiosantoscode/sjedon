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
    describe('evalExpression', function () {
        it('literals', function () {
            var sjedon = aSjedon('3');
            ok.equal(sjedon.evalExpression(sjedon.ast.body[0].expression), 3);
            sjedon = aSjedon('"3"')
            ok.equal(sjedon.evalExpression(sjedon.ast.body[0].expression), "3");
            sjedon = aSjedon("'3'")
            ok.equal(sjedon.evalExpression(sjedon.ast.body[0].expression), "3");
        });
        // TODO
    });
    it('functions and returns', function () {
        var sjedon = aSjedon('(function () { return 3; })');
        var result = sjedon.callFunction(sjedon.ast.body[0].expression);
        ok.equal(result, 3);
        ok.equal(typeof result, 'number');
    });
})



