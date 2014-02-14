/*
 * sjedon
 * https://github.com//sjedon
 *
 * Copyright (c) 2014 
 * Licensed under the MIT license.
 */

'use strict';

var EventEmitter = require('events').EventEmitter;

function Sjedon(ast) {
    if (!(this instanceof Sjedon)) { return new Sjedon(ast); }
}

Sjedon.prototype = new EventEmitter();



module.exports = Sjedon;
