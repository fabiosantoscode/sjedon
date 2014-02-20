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
        it('arrays, objects', function () {
            ok.deepEqual(evalExpr('[1,2,3]'), [1,2,3]);
            ok.deepEqual(evalExpr('({ a: 1, "b": 2 })'), { a: 1, b: 2});
            ok.deepEqual(evalExpr('([[], [1]])'), [[], [1]]);
        });
        /* TODO */xit('recursive arrays, objects', function () {
            ok.deepEqual(evalExpr('{a:[1,2,{b:3}]}', { a: [1, 2, { b: 3 }]}))
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
            ok.strictEqual(evalExpr('void {}', undefined));
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

describe('var scope', function () {
    var sjedon
    var emptyFunc
    var xFunc
    var globDecl
    var xDecl
    var xDeclInFunc
    beforeEach(function() {
        sjedon = aSjedon('var glob,x;' +
            '(function () {}, function() { var x })');
        var funcs = sjedon.ast.body[1].expression.expressions
        ok(funcs && funcs.length === 2)
        emptyFunc = funcs[0]; xFunc = funcs[1]
        xDeclInFunc = xFunc.body.body[0].declarations[0]
        var decls = sjedon.ast.body[0].declarations
        globDecl = decls[0]; xDecl = decls[1];
        ok(xDeclInFunc); ok(emptyFunc); ok(xFunc); ok(globDecl); ok(xDecl);
    })
    describe('list variables in the innermost scope', function () {
        it('on empty function', function () {
            var vars = sjedon.scopeVariables(emptyFunc)
            ok.deepEqual(vars, ['arguments']);
        })
        it('on xDecl function', function () {
            var vars = sjedon.scopeVariables(xFunc)
            ok.deepEqual(vars, ['arguments', 'x']);
        })
    })
    xit('we are able to find the scope by navigating upwards in the AST', function () {
        var foundScope = sjedon.findScope(xFunc.body.body[0])
        ok(foundScope)
        ok.strictEqual(foundScope, xFunc)
    })
    xit('findScope for a specific variable', function () {
        var foundScope = sjedon.findScope(xFunc.body.body[0], 'x')
        var foundScopeOuter = sjedon.findScope(xFunc.body.body[0], 'glob')
        ok(foundScope); ok(foundScopeOuter)
        ok.strictEqual(foundScope, xFunc)
        ok.strictEqual(foundScopeOuter, sjedon.ast)
    })
    xit('we can access variables within this function', function () {
        evalExpr('(function () {' +
            'var x = 1;' +
            'var y;' +
            'return [x, y]' +
        '}())');
    })
    xit('and arguments', function () {
        ok.strictEqual(evalExpr('(function(a){return a;}(1))'), 1);
    })
});

describe('StackFrame class', function () {
    var sjedon
    var a, b
    beforeEach(function () {
        sjedon = aSjedon('' +
            function a() {
                b();
            } + '\n' +
            function b() {
                
            } + '\n' +
            'a();')
        a = sjedon.ast.body[0]
        b = sjedon.ast.body[0]
        ok(a), ok(b)
    })
    describe('constructor', function () {
        it('calls scopeVariables', function () {
            sinon.spy(sjedon, 'scopeVariables')

            new Sjedon.StackFrame(sjedon, a, null)

            ok(sjedon.scopeVariables.calledOnce)
            ok(sjedon.scopeVariables.calledWith(a))
        })
    })
    // TODO fetch variables
    // TODO change variables
})

