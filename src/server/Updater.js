const https = require('https');
const fs = require('fs-extra');
const crypto = require('crypto');
/**
 * Used to get information about Minecraft Server versions and to download them
 */
class Updater {
  // Allow defining custom manifest URLs
  /**
   * @param  {String|URL} url
   */
  set url (url) {
    url = url instanceof URL ? url : new URL(url);
    this.customUrl = url.href === Updater.url.href ? undefined : url;
  }

  /**
   * @return {URL}
   */
  get url () {
    return this.customUrl || Updater.url;
  }

  /**
   * @param  {Promise} versions Promise that resolves to parsed versions
   */
  set versions (versions) {
    this.customUrl ? this.customVersions = versions : Updater.versions = versions;
  }

  /**
   * @return {Promise} Resolves to cached versions or 'this.fetchVersions()'
   */
  get versions () {
    return (this.customUrl ? this.customVersions : Updater.versions) || this.fetchVersions();
  }

  /**
   * Fetches the Minecraft version manifest from 'this.url' and parses it
   * @return {Promise} Resolves to parsed versions or rejects with an Error object
   */
  fetchVersions () {
    return new Promise((resolve, reject) => {
      https.get(this.url, (response) => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => {
          const manifest = JSON.parse(data);
          // 'manifest.latest' holds id strings both for 'release' and 'snapshot'
          const versions = { latest: manifest.latest };
          for (const type of Updater.types) { versions[type] = {}; }
          manifest.versions.forEach(version => {
            if (Updater.types.includes(version.type)) {
              versions[version.type][version.id] = {
                url: version.url,
                age: Date.parse(version.time)
              };
            }
          });
          // Cache fetched version list
          this.versions = Promise.resolve(versions);
          resolve(versions);
        });
      }).on('error', error => { reject(error); });
    });
  }

  /**
   * Downloads the requested version of Minecraft Server into the the given path
   * @param  {String} version Version which to download or if invalid latest release
   * @param  {String} path An absolute file path where to write the downloaded file
   * @return {Promise} Resolves to version of downloaded server or rejects with an Error object
   */
  download (version, path) {
    return this.versions.then(versions => {
      return new Promise((resolve, reject) => {
        const url = (versions.release[version] || versions.snapshot[version] || versions.release[versions.latest.release]).url;
        https.get(new URL(url), (response) => {
          let data = '';
          response.on('data', chunk => { data += chunk; });
          response.on('end', () => { resolve(data); });
        }).on('error', error => { reject(error); });
      });
    }).then(data => {
      return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(path);
        const hash = crypto.createHash('sha1');
        const executable = JSON.parse(data);
        https.get(new URL(executable.downloads.server.url), (response) => {
          response.pipe(fileStream);
          response.on('data', chunk => { hash.update(chunk); });
          response.on('end', () => {
            if (executable.downloads.server.sha1 !== hash.digest('hex')) {
              reject(new Error('File hash mismatch!'));
            }
          });
          fileStream.on('finish', () => { resolve(executable.id); });
        }).on('error', error => { reject(error); });
      });
    });
  }
}
// Default manifest URL string, so as not to store copies in every instance
Updater.url = new URL('https://launchermeta.mojang.com/mc/game/version_manifest.json');
// Array of version types to include when parsing manifest
Updater.types = [
  'release',
  'snapshot'
];

module.exports = Updater;
