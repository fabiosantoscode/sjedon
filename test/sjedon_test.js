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
function evalStatements(s) {
    return evalExpr('(function(){\n'+s+'\n}())');
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
        it('math binOps', function () {
            ok.equal(evalExpr('1+1'), 2);
            ok.equal(evalExpr('1*1'), 1);
            ok.equal(evalExpr('1/2'), 0.5);
            ok.equal(evalExpr('1-1'), 0);
        });
    });
    describe('unary operators', function () {
        it('void', function () {
            ok.strictEqual(evalExpr('void 1', undefined));
            ok.strictEqual(evalExpr('void {}', undefined));
        })
    });
    it('ternaries', function () {
        ok.strictEqual(evalExpr('1 ? 2 : 3'), 2)
        ok.strictEqual(evalExpr('0 ? 2 : 3'), 3)
    });
    it('conditionals', function () {
        ok.strictEqual(evalStatements('if (1) {return 1}'), 1)
        ok.strictEqual(evalStatements('if (0) {return 1} return 0'), 0)
        ok.strictEqual(evalStatements('if (0) {return 1} else { return 0 }'), 0)
        ok.strictEqual(evalStatements('if (1) {return 1} else { return 0 }'), 1)
        ok.strictEqual(evalStatements('if (1) return 1'), 1)
        ok.strictEqual(evalStatements('if (0) return 1; return 0'), 0)
    });
    describe('switches', function () {
        it('(empty switch)', function () {
            ok.strictEqual(evalStatements('switch(42){}'), undefined);
        });
        it('skip cases which aren\'t triple-equal', function () {
            ok(evalStatements('switch(3){case "3":return false; case 3: return true;}'));
        });
        it('can have return statements inside', function () {
            ok(evalStatements('switch(3){case 3: return true; }return false;'));
        });
        it('are breakable', function () {
            ok.equal(evalStatements('switch(3){case 3: break; return false};'), undefined);
        });
        it('(fall-through)', function () {
            ok.equal(evalStatements('switch(3){case 3: case 4: return true};'), true);
            ok.equal(evalStatements('switch(3){case 3: default: return true};'), true);
        });
        it('have a default label, which is where control flow goes by default', function () {
            ok(evalStatements('switch(42){default: return true; }return false;'));
            ok(evalStatements('switch(42){case 3: default: return true; }return false;'));
        });
    });
    // TODO labeled break (?)
})

describe('property access:', function () {
    var obj = '({ a: 1, 2: 2 })';

    it('The in operator returns a boolean indicating whether the property is present in the object', function () {
        ok.equal(evalExpr('"a" in ' + obj), true, 'object should contain "a"');
        ok.equal(evalExpr('2 in ' + obj), true, 'numbers work too. the object contains 2 but this is implicitly converted to "2"');
        ok.equal(evalExpr('"2" in ' + obj), true, 'numbers work too. the object contains 2 but this is implicitly converted to "2" (cont)');
    });

    it('Properties of objects can be accessed', function () {
        ok.equal(evalExpr(obj + '.a'), 1, 'dotted access');
        ok.equal(evalExpr(obj + '[2]'), 2, 'accessed to a number property');
        ok.equal(evalExpr(obj + '["2"]'), 2, 'accessed to a number property as a string');
    });

    it('Properties of objects can be modified', function () {
        ok.deepEqual(evalStatements('var a = ' + obj + '; a["a"] = 1; a["a"] = 0; return a;'),
            { a: 0, 2: 2 });
    });
});

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
        ok.equal(typeof result, 'undefined');

        result = simpleFunc.callFunction(simpleFuncAST);
        ok.equal(typeof result, 'undefined');
    })
    it('still return when not the only statement', function () {
        var emptyReturn = aSjedon('(function () { /* empty statement */; return 1; })');
        var result = emptyReturn.callFunction(emptyReturn.ast.body[0].expression);
        ok.equal(result, 1);
    })
    it('have a length. its length is the number of parameters (sorry, specs)', function () {
        var length0 = evalExpr('(function () {}).length');
        ok.equal(length0, 0);
        var length1 = evalExpr('(function (a) {}).length');
        ok.equal(length1, 1);
    });
    describe('arguments', function () {
        it('are accessible as variables', function () {
            var funcWithArgs = aSjedon('(function (a,b,c) { return a; })');
            var result = funcWithArgs.callFunction(funcWithArgs.ast.body[0].expression, null, [ 2 ]);
            ok.strictEqual(result, 2);
        });
        it('when too few arguments are passed, they are set as undefined', function () {
            var func = '(function (a, b, c) { return [a, b, c]; })'
            ok.deepEqual(
                evalExpr(func + '(1);'),
                [1, undefined, undefined], 'when part of the arguments passed');
            ok.deepEqual(
                evalExpr(func + '();'),
                [undefined, undefined, undefined], 'no arguments passed');
        });
        it('when too many arguments are passed, they don\'t crash sjedon (regression)', function () {
            ok(evalExpr('(function(a){ return 1 })(1, 2, 3)'), 'the function takes one argument');
            ok(evalExpr('(function(){ return 1 })(1, 2, 3)'), 'the function takes no arguments');
        });
        describe('(arguments objects)', function () {
            var args;
            beforeEach(function() {
                args = evalExpr('(function(a,b,c){ return arguments })(1,2);');
            });
            it('are passed as an "arguments" pseudo-array.', function () {
                ok(args);
                ok.equal(typeof args, 'object');
                ok.equal(args.length, 2);
                ok.equal(args[0], 1);
                ok.equal(args[1], 2);
                ok(!args.splice);
            });
            it('have a length equal to the length of arguments used in the call', function () {
                ok.equal(args.length, 2);
            });
            it('... even if these arguments are too many', function () {
                ok.equal(
                    evalExpr('(function () { return arguments; }(1,2,3)).length'),
                    3,
                    'function had no parameters');
                ok.equal(
                    evalExpr('(function (a) { return arguments; }(1,2,3)).length'),
                    3,
                    'function had one parameter');
            });
        });
    })
    describe('this', function() {
        xit('is set to the object the function was called as a property of', function () {}); // TODO
        xit('is set to null when the function wasn\'t called as a property of anything', function () {}); // TODO
    });
    describe('calling functions', function () {
        it('cause StackFrame\'s to be constructed.', sinon.test(function () {
            var fakeStackFrame = {fake: 'stackframe'};
            var spy = this.stub(Sjedon, 'StackFrame').returns(fakeStackFrame);

            func.callFunction(funcAST);
            ok(spy.calledOnce)
            ok(spy.calledWithNew())
        }))
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
                /* jshint unused:false */
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
        ok(a); ok(b)
        globalFrame = new Sjedon.StackFrame({
            sjedon: sjedon,
            ast: sjedon.ast,
            parent: null
        })
        aFrame = new Sjedon.StackFrame({
            sjedon: sjedon,
            ast: a,
            parent: globalFrame
        })
        bFrame = new Sjedon.StackFrame({
            sjedon: sjedon,
            ast: b,
            parent: aFrame
        })
        sjedon.currentFrame = aFrame
    })
    describe('constructor', function () {
        it('calls scopeVariables', function () {
            sinon.spy(sjedon, 'scopeVariables')

            new Sjedon.StackFrame({
                sjedon: sjedon,
                ast: a,
                parent: null
            })

            ok(sjedon.scopeVariables.calledOnce)
            ok(sjedon.scopeVariables.calledWith(a))
        })
        it('starts with an object with variables as keys', function () {
            ok.deepEqual(globalFrame.variables, {
                "globVar": undefined,
                "a": undefined,
                "b": undefined
            })

            ok.deepEqual(bFrame.variables, {
                'arguments': undefined,
                'y': undefined
            })
        })
    })
    describe('variables', function () {
        beforeEach(function () {
            globalFrame.variables['someValue'] = 'someValue'
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
        it('the Sjedon instance just calls the trace function in the bottom stack', function () {
            ok('currentFrame' in sjedon)
            sjedon.currentFrame = { trace: sinon.stub().returns(123) }
            ok.equal(sjedon.trace(), 123)
            ok(sjedon.currentFrame.trace.calledOnce)
        })
    })
    describe('running a function', function () {
        it('assignments occur', function () {
            var OriginalStackFrame = Sjedon.StackFrame
            var mockFrame
            sinon.stub(Sjedon, 'StackFrame', function (opts) {
                ok.equal(arguments.length, 1, 'sanity check');
                mockFrame = new OriginalStackFrame(opts);
                mockFrame.assignVar = sinon.stub()
                return mockFrame
            })
            sjedon.runFunction(b)
            ok(Sjedon.StackFrame.calledOnce, 'StackFrame got created');
            ok(mockFrame.assignVar.called, 'assignVar() called')
            ok(mockFrame.assignVar.calledOnce, 'assignVar() called only once')
            ok.deepEqual(mockFrame.assignVar.lastCall.args,
                [{ type: "Identifier", name: 'y' }, 3],
                'assignVar() called with ({type: "Identifier", name: "y"}, 3)')
            Sjedon.StackFrame.restore();
        })
    })
})

describe('"Native" objects', function () {
    var global
    beforeEach(function () {
        global = { userFunc: sinon.spy(), TESTING: '1234' }
    });
    it('are fed through the "global" option to Sjedon', function () {
        var sjedon = new Sjedon(esprima.parse('(function(){return TESTING;}())'), {
            global: global });
        ok.equal(sjedon.evalExpression(sjedon.ast.body[0].expression), '1234')
    });

    it('can be used for user callbacks', function () {
        var sjedon = new Sjedon(esprima.parse('userFunc(1, 2, "3")'), {global: global})
        sjedon.run();
        ok(global.userFunc.calledOnce, 'user callback was called from inside Sjedon');
        ok.deepEqual(global.userFunc.lastCall.args, [1, 2, '3'])
    });

    it('... which can be called themselves because they are wrapped', function () {
        var sjedon = new Sjedon(esprima.parse(
            'userFunc(function(v){ return v })'), {
                global: global });
        
        sjedon.run();
        var wrappedFunc = global.userFunc.lastCall.args[0];
        ok.equal(typeof wrappedFunc, 'function');
        ok.equal(wrappedFunc(3), 3);
    });
});

