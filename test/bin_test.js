/* globals describe:false, it:false, beforeEach: false */
'use strict';

var ok = require('assert')
var fs = require('fs')
var path = require('path')
var sinon = require('sinon')
var esprima = require('esprima')
var Sjedon = require('../lib/sjedon.js')

var child_process = require('child_process');

describe('sjedon binary', function () {
    var sjedonPath = path.join(__dirname, '../bin/sjedon')
    var binTestPath = path.join(__dirname, '_bintest.js')

    it('runs code in the repl', function (done) {
        var repl = child_process.spawn('node', [sjedonPath]);
        var first = true
        repl.stdout.on('data', function(data) {
            if ((data+'').trim() === '4') {
                repl.kill();
                return done(null);
            }
        });
        repl.stdin.write('2 + 2\n')
    });

    it('runs scripts in files', function (done) {
        fs.writeFileSync(binTestPath, 'console.log(2 + 2)')
        var runner = child_process.spawn('node', [sjedonPath, binTestPath])
        runner.stdout.on('data', function(data) {
            if ((data+'').trim() === '4') {
                runner.kill();
                return done(null);
            }
        });
    });

    after(function () {
        fs.unlinkSync(binTestPath);
    });
});

