/* globals describe:false, it:false, beforeEach: false */
'use strict';

var ok = require('assert')
var sinon = require('sinon')
var Sjedon = require('../lib/sjedon.js')

describe('Sjedon class', function () {
    it('Can be called or new\'d. Result is always Sjedon instance', function() {
        /* jshint newcap:false */
        // tests here
        var called = Sjedon()
        var newed = new Sjedon()
        ok(called instanceof Sjedon)
        ok(newed instanceof Sjedon)
    })
})

describe('Sjedon instances', function () {
    var sjedon
    beforeEach(function () { sjedon = new Sjedon() })

    sinon.spy(sjedon)
})

