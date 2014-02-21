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
        var called = Sjedon(esprima.parse(''))
        var newed = new Sjedon(esprima.parse(''))
        ok(called instanceof Sjedon)
        ok(newed instanceof Sjedon)
    })
})

function aSjedon(ast) {
    if (typeof ast === 'function') { ast = '(' + ast + ')();' }
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
        it('recursive arrays, objects', function () {
            ok.deepEqual(evalExpr('({a:[1,2,{b:3}]})'), {a:[1,2,{b:3}]})
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
})

describe('functions', function () {
    var simpleFunc, simpleFuncAST
    var func, funcAST
    beforeEach(function () {
        simpleFunc = aSjedon('(function () { })')
        simpleFuncAST = simpleFunc.ast.body[0].expression
        func = aSjedon('(function () { return 3; })')
        funcAST = func.ast.body[0].expression
    })
    it('return values', function () {
        var result = simpleFunc.callFunction(funcAST);
        ok.equal(result, 3);
        ok.equal(typeof result, 'number');
    })
    it('return undefined by default', function () {
        var emptyReturn = aSjedon('(function () { return; })');
        var result = emptyReturn.callFunction(emptyReturn.ast.body[0].expression);
        ok.equal(result, undefined);
        ok.equal(typeof result, 'undefined');

        result = simpleFunc.callFunction(simpleFuncAST);
        ok.equal(result, undefined);
        ok.equal(typeof result, 'undefined');
    })
    describe('calling functions', function () {
        it('cause StackFrame\'s to be constructed.', function () {
            var fakeStackFrame = {fake: 'stackframe'};
            var spy = sinon.stub(Sjedon, 'StackFrame').returns(fakeStackFrame);

            func.callFunction(funcAST);

            try {
                ok(spy.calledOnce)
                ok(spy.calledWithNew())
                ok.equal(spy.lastCall.args.length, 3)
            } finally {
                spy.restore();
            }
        })
    })
})

describe('var scope:', function () {
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
    it('we are able to find the scope of a variable', function () {
        var foundScope = sjedon.findScope(xFunc, 'x')
        ok.strictEqual(foundScope, xFunc)
    })
    it('getting to the global scope', function () {
        var foundScope = sjedon.findScope(emptyFunc, 'x')
        ok.strictEqual(foundScope, sjedon.ast)
    })
    it('return null for implicit variables', function () {
        ok.strictEqual(sjedon.findScope(emptyFunc, 'notexist'), null)
    })
});

describe('StackFrame', function () {
    var sjedon
    var a, b
    var globalFrame, aFrame, bFrame
    beforeEach(function () {
        sjedon = aSjedon('' +
            'var globVar; \n' +
            function a() {
                var x
                b();
            } +
            '\n' +
            function b() {
                var y
                y = 3
            } +
            '\n' +
            'a();')
        a = sjedon.ast.body[1]
        b = sjedon.ast.body[2]
        ok(a), ok(b)
        globalFrame = new Sjedon.StackFrame(sjedon, sjedon.ast, null)
        aFrame = new Sjedon.StackFrame(sjedon, a, globalFrame)
        bFrame = new Sjedon.StackFrame(sjedon, b, aFrame)
        sjedon.currentFrame = aFrame
    })
    describe('constructor', function () {
        it('calls scopeVariables', function () {
            sinon.spy(sjedon, 'scopeVariables')

            new Sjedon.StackFrame(sjedon, a, null)

            ok(sjedon.scopeVariables.calledOnce)
            ok(sjedon.scopeVariables.calledWith(a))
        })
        it('starts with an object with "!" + variables as keys', function () {
            ok.deepEqual(globalFrame.variables, {
                "!globVar": undefined,
                "!a": undefined,
                "!b": undefined
            })

            ok.deepEqual(bFrame.variables, {
                '!arguments': undefined,
                '!y': undefined
            })
        })
    })
    describe('variables', function () {
        beforeEach(function () {
            globalFrame.variables['!someValue'] = 'someValue'
        })
        it('can be fetched', function () {
            ok.equal(aFrame.fetchVar('x'), undefined)
            ok.equal(aFrame.fetchVar('someValue'), 'someValue')
        })
        it('can be assigned', function () {
            bFrame.assignVar('y', 'yeah')
            ok.equal(bFrame.fetchVar('y'), 'yeah')
        })
        it('trying to set a global works', function () {
            bFrame.assignVar('globVar', 'yeah')
            ok.equal(globalFrame.fetchVar('globVar'), 'yeah')
        })
        it('can\'t set a global if it is not declared', function () {
            ok.throws(function () {
                bFrame.assignVar('notexist', 'whatevs')
            })
        })
    })
    describe('tracing', function () {
        it('get stack info above a StackFrame', function () {
            var trace = bFrame.trace()
            ok(trace && 'length' in trace)
            ok.equal(trace.length, 3)
            ok(trace[0].frame === globalFrame)
            ok(trace[1].frame === aFrame)
            ok(trace[2].frame === bFrame)
        })
        it('the bottom stack frame has an alias in the Sjedon instance', function () {
            ok('currentFrame' in sjedon)
            sjedon.currentFrame = { trace: sinon.stub().returns(123) }
            ok.equal(sjedon.trace(), 123)
            ok(sjedon.currentFrame.trace.calledOnce)
        })
    })
    describe('running a function', function () {
        it('assignments occur', function () {
            var stub
            sinon.stub(Sjedon, 'StackFrame')
                .returns((stub = { assignVar: sinon.stub() }))
            sjedon.runFunction(b)
            ok(stub.assignVar.calledOnce)
            ok.deepEqual(stub.assignVar.lastCall.args, ['y', 3])
        })
    })
})

