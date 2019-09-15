const path = require('path');
/**
 * Used to send and parse commands to the Minecraft Server
 */
class Console {
  constructor (rconSupport = false, maxRetries = 5) {
    this.rcon = rconSupport;
    this.maxRetries = maxRetries;
    let tries = 0;
    this.interface = new (
      require(path.resolve(path.join('manager', `${rconSupport ? 'Rcon.js' : 'Lcon.js'}`)))
    )((error, ...connectionArguments) => {
      if (error) {
        // Older servers might not close gracefuly
        console.error(`${error.code === 'ECONNRESET' ? 'This can likely be ignored: ' : ''}${error}`);
        if (tries < maxRetries) {
          tries++;
          this.interface.connect(...connectionArguments)
            .then(() => { tries = 0; })
            .catch(error => { console.error(error); });
        } else {
          console.error(new Error('Couldn\'t reconnect the console interface!'));
        }
      }
    });
  }
}

module.exports = Console;
