/* eslint-disable quote-props */

'use strict';
const assert = require('assert');
const sinon = require('sinon');
const capture = require('capture-stream');
const path = require('path');

const gulpLoadPlugins = (function() {
  const wrapInFunc = function(value) {
    return function() {
      return value;
    };
  };

  const proxyquire = require('proxyquire').noCallThru();

  return proxyquire('../', {
    'gulp-foo': wrapInFunc({ name: 'foo' }),
    'gulp-bar': wrapInFunc({ name: 'bar' }),
    'bar': wrapInFunc({ name: 'bar' }),
    'gulp-foo-bar': wrapInFunc({ name: 'foo-bar' }),
    'jack-foo': wrapInFunc({ name: 'jack-foo' }),
    'gulp-insert': {
      'append': wrapInFunc({ name: 'insert.append' }),
      'wrap': wrapInFunc({ name: 'insert.wrap' })
    },
    'gulp.baz': wrapInFunc({ name: 'baz' }),
    'findup-sync': function() { return null; },
    '@myco/gulp-test-plugin': wrapInFunc({ name: 'test' })
  });
})();

describe('configuration', function() {
  it('throws a nice error if no configuration is found', function() {
    assert.throws(function() {
      gulpLoadPlugins({
        config: null
      });
    }, /Could not find dependencies. Do you have a package.json file in your project?/);
  });

  it("throws a nice error if there're repeated dependencies pattern in package.json ", function() {
    assert.throws(function() {
      gulpLoadPlugins({
        pattern: [
          '*',
          '!gulp'
        ],
        config: {
          dependencies: {
            'bar': '*',
            'gulp-bar': '~0.0.12'
          }
        }
      });
    }, /Could not define the property "bar", you may have repeated dependencies in your package.json like "gulp-bar" and "bar"/);
  });

  it("throws a nice error if there're repeated package names pattern in package.json ", function() {
    assert.throws(function() {
      gulpLoadPlugins({
        config: {
          dependencies: {
            '@foo/gulp-bar': '*',
            'gulp-bar': '~0.0.12'
          }
        },
        maintainScope: false
      });
    }, /Could not define the property "bar", you may have repeated a dependency in another scope like "gulp-bar" and "@foo\/gulp-bar"/);
  });
});

// Contains common tests with and without lazy mode.
const commonTests = function(lazy) {
  it('loads things in', function() {
    const x = gulpLoadPlugins({
      lazy,
      config: {
        dependencies: {
          'gulp-foo': '1.0.0',
          'gulp-bar': '*',
          'gulp-insert': '*',
          'gulp.baz': '*'
        }
      }
    });

    assert.deepStrictEqual(x.foo(), {
      name: 'foo'
    });
    assert.deepStrictEqual(x.bar(), {
      name: 'bar'
    });
    assert.deepStrictEqual(x.baz(), {
      name: 'baz'
    });
    assert.deepStrictEqual(x.insert.wrap(), {
      name: 'insert.wrap'
    });
    assert.deepStrictEqual(x.insert.append(), {
      name: 'insert.append'
    });
  });

  it('can take a pattern override', function() {
    const x = gulpLoadPlugins({
      lazy,
      pattern: 'jack-*',
      replaceString: 'jack-',
      config: {
        dependencies: {
          'jack-foo': '1.0.0',
          'gulp-bar': '*'
        }
      }
    });

    assert.deepStrictEqual(x.foo(), {
      name: 'jack-foo'
    });
    assert(!x.bar);
  });

  it('can extend the patterns', function() {
    const x = gulpLoadPlugins({
      lazy,
      config: {
        dependencies: {
          'jack-foo': '1.0.0',
          'gulp-bar': '*'
        }
      },
      overridePattern: false,
      pattern: 'jack-*'
    });

    assert.deepStrictEqual(x.jackFoo(), {
      name: 'jack-foo'
    });
    assert(x.bar);
  });

  it('allows camelizing to be turned off', function() {
    const x = gulpLoadPlugins({
      lazy,
      camelize: false,
      config: {
        dependencies: {
          'gulp-foo-bar': '*'
        }
      }
    });

    assert.deepStrictEqual(x['foo-bar'](), {
      name: 'foo-bar'
    });
  });

  it('camelizes plugins name by default', function() {
    const x = gulpLoadPlugins({
      lazy,
      config: {
        dependencies: {
          'gulp-foo-bar': '*'
        }
      }
    });

    assert.deepStrictEqual(x.fooBar(), {
      name: 'foo-bar'
    });
  });

  it('lets something be completely renamed', function() {
    const x = gulpLoadPlugins({
      lazy,
      config: { dependencies: { 'gulp-foo': '1.0.0' } },
      rename: { 'gulp-foo': 'bar' }
    });

    assert.deepStrictEqual(x.bar(), { name: 'foo' });
  });

  it('outputs debug statements', function() {
    const restore = capture(process.stdout);
    try {
      const x = gulpLoadPlugins({
        lazy,
        DEBUG: true,
        config: { dependencies: { 'gulp-foo': '*' } }
      });

      assert.deepStrictEqual(x.foo(), {
        name: 'foo'
      });
    } catch (err) {
      restore();
      throw err;
    }

    const output = restore('true');
    assert(output.indexOf('gulp-load-plugins') !== -1, 'Expected output to be logged to stdout');
  });

  it('supports loading scopped package as a nested reference', function() {
    const x = gulpLoadPlugins({
      lazy,
      config: { dependencies: { '@myco/gulp-test-plugin': '1.0.0' } }
    });

    assert.deepStrictEqual(x.myco.testPlugin(), { name: 'test' });
  });

  it('supports loading scopped package as a top-level reference', function() {
    const x = gulpLoadPlugins({
      lazy,
      maintainScope: false,
      config: { dependencies: { '@myco/gulp-test-plugin': '1.0.0' } }
    });

    assert.deepStrictEqual(x.testPlugin(), { name: 'test' });
  });

  it('supports custom rename functions', function () {
    const x = gulpLoadPlugins({
      renameFn: function () {
        return 'baz';
      },
      config: {
        dependencies: {
          'gulp-foo-bar': '*'
        }
      }
    });

    assert.throws(function () {
      x.fooBar();
    });

    assert.deepStrictEqual(x.baz(), {
      name: 'foo-bar'
    });
  });

  it('supports transforming', function() {
    const x = gulpLoadPlugins({
      lazy,
      config: { dependencies: { 'gulp-foo': '1.0.0' } },
      postRequireTransforms: {
        foo: function(foo) {
          foo.bar = 'test string';
          return foo;
        }
      }
    });

    assert.strictEqual(x.foo.bar, 'test string');
  });
};

describe('no lazy loading', function() {
  commonTests(false);

  let spy;
  before(function() {
    spy = sinon.spy();
    gulpLoadPlugins({
      lazy: false,
      config: {
        dependencies: {
          'gulp-insert': '*'
        }
      },
      requireFn: function() {
        spy();
        return function() {};
      }
    });
  });

  it('does require at first', function() {
    assert(spy.called);
  });
});

describe('with lazy loading', function() {
  commonTests(true);

  let x, spy;
  before(function() {
    spy = sinon.spy();
    x = gulpLoadPlugins({
      lazy: true,
      config: {
        dependencies: {
          'gulp-insert': '*'
        }
      },
      requireFn: function() {
        spy();
        return function() {};
      }
    });
  });

  it('does not require at first', function() {
    assert(!spy.called);
  });

  it('does when the property is accessed', function() {
    x.insert();
    assert(spy.called);
  });
});

describe('common functionality', function () {
  it('throws a sensible error when not found', function () {
    const x = gulpLoadPlugins({ config: path.join(__dirname, '/package.json') });

    assert.throws(function () {
      x.oops();
    }, /Cannot find module 'gulp-oops'/);
  });

  it('allows you to use in a lower directory', function() {
    const plugins = require('../')();
    assert.ok(typeof plugins.test === 'function');
  });
});
