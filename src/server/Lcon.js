const path = require('path');
const { EOL } = require('os');
const EventEmitter = require('events');

const Packet = require(path.resolve('manager', 'Packet.js'));
/**
 * Used to connect and send commands to a console through IO streams
 */
class Lcon {
  /**
   * @param {Number} [timeout=1000] Timeout for connections and responses
   */
  constructor (timeout = 1000) {
    this.timeout = timeout;
    this.events = new EventEmitter();
    this.reset();
  }

  /**
   * Resets the internal state
   */
  reset () {
    this.online = false;
    this.authenticated = false;
    this.queue = [];
    this.queue.drained = true;
  }

  /**
   * Immediately sends out as many queued packets as possible
   */
  drain () {
    while (this.queue.drained && this.queue.length > 0) {
      this.queue.drained = this.socket.write(this.queue.shift());
    }
  }

  /**
   * Send a packet with given payload through the socket
   * @param  {String} payload Data to encode into the packet
   * @param  {Number} [type=Packet.type.COMMAND] Type of packet to send
   * @return {Promise} Resolves to response or rejects with an Error object
   */
  send (payload, id = Math.random().toString(16).substring(2, 10).replace(/(.{4})/, '$1~')) {
    return Promise.race([
      new Promise(resolve => setTimeout(resolve, this.timeout, new Error('Packet timed out!'))),
      new Promise(resolve => {
        this.queue.push(`${payload}${EOL}`);
        this.queue.push(`/kick ${id}${EOL}`);
        this.drain();
        this.events.once(id, resolve);
      })
    ]).then(result => Promise[result instanceof Error ? 'reject' : 'resolve'](result));
  }

  /**
   * Send the given command through an authenticated RCON connection
   * @param  {String} command
   * @return {Promise} Resolves to response or rejects with an Error object
   */
  command (command) {
    return !this.online || !this.authenticated
      ? Promise.reject(new Error('Console is not connected and authenticated!'))
      : this.send(command).then(packets => packets.map(packet => packet.payload).join(''));
  }

  /**
   * Connects and authenticates the RCON instance
   * @param  {String} password Password with which to connect
   * @param  {Number} [port=25567] Port from where to connect
   * @param  {String} [host='localhost'] Address from where to find the server
   * @return {Promise} Resolves if succesful or rejects with an Error object
   */
  connect (password, port = 25575, host = 'localhost') {
    return Promise.race([
      new Promise(resolve => setTimeout(resolve, this.timeout, new Error('Connection timed out!'))),
      new Promise(resolve => {
        let data = Buffer.allocUnsafe(0);
        this.socket = net.connect({ port, host, timeout: this.timeout })
          .on('close', () => { this.events.emit('close'); this.reset(); })
          .on('drain', () => { this.drain(); })
          .once('error', resolve)
          .once('connect', () => {
            this.online = true;
            this.events.emit('connect');
            // Send and process authentication packet
            this.send(password, Packet.type.AUTH).then(results => {
              // Keep event list clean
              this.socket.off('error', resolve);
              if (results.pop().id !== -1) {
                this.authenticated = true;
                this.events.emit('auth');
                resolve();
              } else {
                resolve(new Error('Authentication failed!'));
              }
            });
          })
          .on('data', chunk => {
            data = Buffer.concat([data, chunk], data.length + chunk.length);
            // First 12 bytes are guaranteed to be the packet length, id and type
            for (let end; (end = data.indexOf(Packet.payload.END, 12)) >= 0;) {
              const packets = [];
              for (let start = 0; start < end;) {
                packets.push(Packet.read(data.slice(start, start += data.readInt32LE(start) + 4)));
              }
              this.events.emit(packets.pop().id, packets);
              // Buffer.byteLength(Packet.payload.END, 'ascii') === 20
              data = data.slice(end + 20);
            }
          });
      })
    ]).then(result => Promise[result instanceof Error ? 'reject' : 'resolve'](result));
  }
}

module.exports = Lcon;
