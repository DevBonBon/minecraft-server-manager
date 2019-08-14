const { describe, it, before, after } = require('mocha');
const assert = require('assert').strict;
const nock = require('nock');
const path = require('path');

const Updater = require(path.resolve('src', 'server', 'Updater'));

const url = { default: Updater.url, test: new URL('https://test/manifest.json') };
const scope = { default: nock(url.default.origin), test: nock(url.test.origin) };

describe('Updater', function () {
  describe('properties', function () {
    before(function () {
      this.updater = new Updater();
      this.reply = { latest: '', versions: [] };
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
    describe('versions', function () {
      it('should store versions globally if default URL', async function () {
        scope.default.get(url.default.pathname).reply(200, this.reply);
        assert.equal(await this.updater.versions, await Updater.versions);
      });
      it('should store versions locally if a custom URL', async function () {
        scope.test.get(url.test.pathname).reply(200, this.reply);
        this.updater.url = url.test;
        assert.notEqual(await this.updater.versions, await Updater.versions);
      });
    });
  });
});
