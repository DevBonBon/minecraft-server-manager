const https = require('https');
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
          const versions = { latest: manifest.latest, release: {}, snapshot: {} };
          manifest.versions.forEach(version => {
            switch (version.type) {
              case 'release': versions.release[version.id] = version.url; break;
              case 'snapshot': versions.snapshot[version.id] = version.url; break;
            }
          });
          // Cache fetched version list
          this.versions = Promise.resolve(versions);
          resolve(versions);
        });
      }).on('error', error => { reject(error); });
    });
  }
}
// Default manifest URL string, so as not to store copies in every instance
Updater.url = new URL('https://launchermeta.mojang.com/mc/game/version_manifest.json');

module.exports = Updater;
