const { EOL } = require('os');
const EventEmitter = require('events');
/**
 * Used to create and send commands through IO streams
 */
class Lcon {
  /**
   * @param {Function} [close=()=>{}] Called after connection has closed
   * @param {Number} [timeout=3000] Timeout for connections and responses
   */
  constructor (close = () => {}, timeout = 500) {
    this.close = error => { this.reset(); close(error); };
    this.timeout = timeout;
    this.reset();
    this.events = new EventEmitter()
      .on('removeListener', (id, listener) => {
        clearTimeout(this.queue.pending[id].timer);
        delete this.queue.pending[id];
      })
      .on('newListener', (id, listener) => {
        this.queue.pending[id] = {
          timer: setTimeout(() => {
            this.events.emit(id, new Error('Packet timed out!'));
            this.events.off(id, listener);
          }, this.timeout),
          payloads: []
        };
      });
  }

  /**
   * Resets the internal state
   */
  reset () {
    this.online = false;
    this.authenticated = false;
    this.queue = {
      drained: true,
      sending: [],
      pending: []
    };
  }

  /**
   * Immediately sends out a single command if possible
   */
  drain () {
    if (this.queue.drained && this.queue.sending.length > 0) {
      this.socket.write(this.queue.sending.shift());
      this.drained = false;
    }
  }

  /**
   * Creates the console
   * @param  {stream.Writeable} stdin Console input stream
   * @param  {stream.Readable} stdout Console output stream
   * @param  {stream.Writeable} stderr Console error stream
   * @return {Promise} Resolves if succesful or Rejects an Error if one occured
   */
  connect (stdin, stdout, stderr) {
    if (this.online) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.online = true;
      this.authenticated = true;
      let data = Buffer.allocUnsafe(0);
      let output = [];
      let callback;
      const commandEndRegExp = /^\[[\d:]{8} [\w/]+\] Unknown command/;
      this.socket = {
        write: stdin.write,
        stderr: stderr,
        stdin: stdin
          .on('close', () => { this.close(); })
          .on('error', error => { this.close(error, stdin, stdout, stderr); }),
        stdout: stdout
          .on('data', (chunk) => {
            data = Buffer.concat([data, chunk]);
            let index = data.indexOf(EOL);
            while (index !== -1) {
              const line = data.toString('utf8', 0, index);
              if (commandEndRegExp.test(line)) {
                if (callback && callback.valid) {
                  callback(output);
                }
                callback = this.queue.pending.pop();
                output = [];
                this.drain();
              } else {
                output.push(line);
              }
              data = data.slice(index + EOL.length);
              index = data.indexOf(EOL);
            }
          })
      };
    });
  }

  /**
   * Sends the given command
   * @param  {String} command
   * @return {Promise} Resolves to output or Rejects an Error if one occured
   */
  send (command) {
    if (!this.online) {
      return Promise.reject(new Error('The console needs to be created first!'));
    } else {
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(16).substring(2, 10).replace(/(.{4})/, '$1~');
        this.queue.sending.push(`${command}${EOL}/invalidcommand${EOL}`);
        this.drain();
        const callback = function (timer, result) {
          clearTimeout(timer);
          this.valid = false;
          if (result instanceof Error) {
            reject(result);
          } else {
            resolve(result.map(line => line.replace(/^\[[\d:]{8} [\w/]+\]: /, '')));
          }
        }.bind({ valid: true }, setTimeout(() => {
          callback(new Error('Command timed out!'));
        }, this.timeout));
        this.queue.pending.unshift(callback);
      });
    }
  }
}

module.exports = Lcon;
