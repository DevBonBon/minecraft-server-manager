const { describe, it, before, after } = require('mocha');
const assert = require('assert').strict;
const path = require('path');

const Updater = require(path.resolve('src', 'server', 'Updater'));

const url = { default: Updater.url, test: new URL('https://test/manifest.json') };

describe('Updater', function () {
  describe('properties', function () {
    before(function () {
      this.updater = new Updater();
    });

    describe('url', function () {
      it('should be defined', function () {
        assert.equal(this.updater.url, url.default);
      });
      it('should store a custom URL', function () {
        this.updater.url = url.test;
        assert.equal(this.updater.url, url.test);
      });
      // Testing internal properties is discouraged, but necessary for full coverage
      it('should not store the default URL', function () {
        this.updater.url = url.default;
        assert.ok(!this.updater.customUrl);
      });
    });
  });
});
