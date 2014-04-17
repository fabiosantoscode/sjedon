'use strict';

module.exports = function (grunt) {
  require('jit-grunt')(grunt, {
    'simplemocha': 'grunt-simple-mocha',
    'shell': 'grunt-shell'
  });

  // Project configuration.
  grunt.initConfig({
    shell: {
      cpp: {
        command: 'cpp -P -undef -Wundef -std=c99 -nostdinc -Wtrigraphs -fdollars-in-identifiers -C lib/sjedon-eval.cpp.js > lib/sjedon-eval.js',
        options: { stderr: true },
      }
    },
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
        src: [
          'lib/**/*.js',
          '!lib/sjedon-eval.js'
        ]
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
  grunt.registerTask('default', ['build', 'jshint', 'simplemocha']);
  grunt.registerTask('build', ['shell:cpp']);
};
