const { get } = require('https');
const { createHash } = require('crypto');
const { createWriteStream } = require('fs-extra');
/**
 * Used to get information about Minecraft Server versions and to download them
 */
class Updater {
  /**
   * @return {String}
   */
  get url () {
    return this.customUrl ? this.customUrl : Updater.url;
  }

  /**
   * @param  {String} url
   */
  set url (url) {
    this.customUrl = url;
  }

  /**
   * See 'Updater.fetchVersions()'
   * @return {Promise}
   */
  get versions () {
    return Updater.versions || Updater.fetchVersions(this.url);
  }

  /**
   * Fetches the Minecraft version manifest and parses it
   * @param  {[type]} [url=Updater.url] Link to Minecraft Server version manifest
   * @return {Promise} Resolves to parsed versions or an Error object if one occured
   */
  static fetchVersions (url = Updater.url) {
    return new Promise((resolve, reject) => {
      get(url, (response) => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => {
          const manifest = JSON.parse(data);
          // 'manifest.latest' holds id strings both for 'release' and 'snapshot'
          const versions = { latest: manifest.latest, releases: {}, snapshots: {} };
          manifest.versions.forEach(version => {
            switch (version.type) {
              case 'release': versions.releases[version.id] = version.url; break;
              case 'snapshot': versions.snapshots[version.id] = version.url; break;
            }
          });
          // Cache fetched version list
          Updater.versions = Promise.resolve(versions);
          resolve(versions);
        });
      }).on('error', error => {
        console.error(`Failed to fetch version list! [${url}]`);
        reject(error);
      });
    });
  }

  /**
   * Downloads the requested version of Minecraft Server into the the given path
   * @param  {String} version Version which to download or if invalid latest release
   * @param  {String} path An absolute file path where to write the downloaded file
   * @return {Promise} Resolves to version of downloaded server or an Error object if one occured
   */
  static download (version, path) {
    // 'Updater.versions' might still be undefined
    return (Updater.versions || Updater.fetchVersions())
      .then(versions => {
        return new Promise((resolve, reject) => {
          const url = versions.releases[version] || versions.snapshots[version] || versions.releases[versions.latest.release];
          get(url, (response) => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
              resolve(data);
            });
          }).on('error', error => {
            console.error(`Failed to fetch version package information! [${url}]`);
            reject(error);
          });
        });
      })
      .then(data => {
        return new Promise((resolve, reject) => {
          const fileStream = createWriteStream(path);
          const hash = createHash('sha1');
          const executable = JSON.parse(data);
          get(executable.downloads.server.url, (response) => {
            response.pipe(fileStream);
            response.on('data', chunk => { hash.update(chunk); });
            response.on('end', () => {
              if (executable.downloads.server.sha1 === hash.digest('utf8')) {
                reject(new Error('File hash mismatch!'));
              }
            });
            fileStream.on('finish', () => { resolve(executable.id); });
          }).on('error', error => {
            console.error(`Failed to download Minecraft Server executable! [${executable.downloads.server.url}]`);
            reject(error);
          });
        });
      });
  }
}
// Default manifest URL, no point in storing copies of the same string in every instance
Updater.url = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';

module.exports = Updater;
