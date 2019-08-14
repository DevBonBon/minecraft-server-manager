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
}
// Default manifest URL string, so as not to store copies in every instance
Updater.url = new URL('https://launchermeta.mojang.com/mc/game/version_manifest.json');

module.exports = Updater;
