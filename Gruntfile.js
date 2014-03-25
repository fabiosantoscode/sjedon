'use strict';

module.exports = function (grunt) {
  require('jit-grunt')(grunt, {
    'simplemocha': 'grunt-simple-mocha'
  });

  // Project configuration.
  grunt.initConfig({
    simplemocha: {
      options: {
        timeout: 3000,
        ignoreLeaks: false,
        ui: 'bdd',
        reporter: 'tap'
      },
      bin: { src: ['test/*bin*.js'] },
      lib: { src: ['test/*sjedon*.js'] }
    },
    jshint: {
      options: {
        jshintrc: '.jshintrc',
        reporter: require('jshint-stylish')
      },
      gruntfile: {
        src: 'Gruntfile.js'
      },
      lib: {
        src: ['lib/**/*.js']
      },
      tests: {
        src: ['test/**/*.js']
      }
    },
    watch: {
      gruntfile: {
        files: '<%= jshint.gruntfile.src %>',
        tasks: ['jshint:gruntfile']
      },
      jshint: {
        files: [
          '<%= jshint.tests.src %>', 
          '<%= jshint.lib.src %>',
          '<%= jshint.gruntfile.src %>']
      },
      simplemocha: {
        files: [
          '<%= jshint.tests.src %>',
          '<%= jshint.lib.src %>'],
        tasks: ['simplemocha']
      }
    }
  });

  // Default task.
  grunt.registerTask('default', ['jshint', 'simplemocha']);
};
