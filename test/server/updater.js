const { describe, it, before, after } = require('mocha');
const assert = require('assert').strict;
const mock = require('mock-fs');
const fs = require('fs-extra');
const nock = require('nock');
const path = require('path');

const Updater = require(path.resolve('src', 'server', 'Updater'));

const url = { default: Updater.url, test: new URL('https://test/manifest.json') };
const scope = { default: nock(url.default.origin), test: nock(url.test.origin) };
// Versions to mock, these are the versions where RCON was added to minecraft
// Latest release and snapshot versions on indexes 0 and 1 respectively
const versions = [
  { id: '1.9', type: 'release', file: 'r' },
  { id: '1.9-pre4', type: 'snapshot', file: 's' }
];

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

  describe('methods', function () {
    before(function () {
      mock();
      this.updater = new Updater();
      this.reply = {
        latest: { release: versions[0].id, snapshot: versions[1].id },
        versions: []
      };
      this.result = { latest: this.reply.latest, release: {}, snapshot: {} };
      this.download = {
        reply: 'server contents',
        hash: '81931219108be3f491caa9769cc4d6a653ab53c6',
        release: {},
        snapshot: {}
      };
      for (const version of versions) {
        const location = `${url.default.origin}/${version.file}`;
        const now = new Date();
        this.reply.versions.push({
          id: version.id,
          type: version.type,
          url: `${location}.json`,
          time: now.toJSON()
        });
        this.result[version.type][version.id] = {
          url: `${location}.json`,
          age: now.getTime()
        };
        this.download[version.type][version.id] = {
          id: version.id,
          downloads: { server: { sha1: this.download.hash, url: `${location}.jar` } }
        };
      }
    });
    after(mock.restore);

    describe('fetchVersions()', function () {
      it('should fetch and return parsed versions', async function () {
        scope.default.get(url.default.pathname).reply(200, this.reply);
        assert.deepEqual(await this.updater.fetchVersions(), this.result);
      });
    });
    describe('download()', function () {
      it('should download a release version', async function () {
        const version = versions[0];
        scope.default
          .get(`/${version.file}.json`).reply(200, this.download.release[version.id])
          .get(`/${version.file}.jar`).reply(200, this.download.reply);
        const file = path.resolve('release.jar');
        assert.equal(await this.updater.download(version.id, file), version.id);
        assert.equal(await fs.readFile(file, 'utf8'), this.download.reply);
      });
      it('should download a snapshot version', async function () {
        const version = versions[1];
        scope.default
          .get(`/${version.file}.json`).reply(200, this.download.snapshot[version.id])
          .get(`/${version.file}.jar`).reply(200, this.download.reply);
        const file = path.resolve('snapshot.jar');
        assert.equal(await this.updater.download(version.id, file), version.id);
        assert.equal(await fs.readFile(file, 'utf8'), this.download.reply);
      });
      it('should download the latest version', async function () {
        const version = versions[0];
        scope.default
          .get(`/${version.file}.json`).reply(200, this.download.release[version.id])
          .get(`/${version.file}.jar`).reply(200, this.download.reply);
        const file = path.resolve('latest.jar');
        assert.equal(await this.updater.download('latest', file), version.id);
        assert.equal(await fs.readFile(file, 'utf8'), this.download.reply);
      });
      it('should reject with an Error if wrong file hash', async function () {
        const version = versions[0];
        scope.default
          .get(`/${version.file}.json`).reply(200, this.download.release[version.id])
          .get(`/${version.file}.jar`).reply(200, 'bad data');
        const file = path.resolve('error.jar');
        await assert.rejects(this.updater.download('latest', file));
      });
    });
  });
});
