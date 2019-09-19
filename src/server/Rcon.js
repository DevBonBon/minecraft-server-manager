const net = require('net');
const EventEmitter = require('events');

const Packet = require(`${__dirname}/Packet.js`);
/**
 * Used to connect and send commands to a console through the RCON protocol
 */
class Rcon {
  /**
   * @param {Number} [timeout=1500] Timeout for connections and responses
   */
  constructor (timeout = 1500) {
    this.timeout = timeout;
    this.events = new EventEmitter();
    this.reset();
  }

  /**
   * Resets the internal state
   */
  reset () {
    this.queue = [];
    this.queue.drained = true;
    this.authenticated = false;
  }

  /**
   * Immediately sends out as many queued packets as possible
   */
  drain () {
    while (this.queue.drained && this.queue.length) {
      this.queue.drained = this.socket.write(this.queue.shift());
    }
  }

  /**
   * Send a packet with given payload through the socket
   * @param  {String} payload Data to encode into the packet
   * @param  {Number} [type=Packet.type.COMMAND] Type of packet to send
   * @return {Promise} Resolves to an array of responses or rejects with an Error
   */
  send (payload, type = Packet.type.COMMAND, id = Packet.id()) {
    return Promise.race([
      new Promise(resolve => setTimeout(resolve, this.timeout, new Error(Rcon.ERR.PACKET))),
      new Promise(resolve => {
        this.queue.push(Packet.write(id, type, payload));
        this.queue.push(Packet.write(id, Packet.type.END, ''));
        this.drain();
        this.events.once(id, resolve);
      })
    ]).then(result => Promise[result instanceof Error ? 'reject' : 'resolve'](result));
  }

  /**
   * Send the given command through an authenticated RCON connection
   * @param  {String} command
   * @return {Promise} Resolves to response string or rejects with an Error
   */
  command (command) {
    return !this.authenticated
      ? Promise.reject(new Error(Rcon.ERR.AUTH))
      : this.send(command).then(packets => packets.map(packet => packet.payload).join(''));
  }

  /**
   * Connects and authenticates the RCON instance
   * @param  {String} password Password with which to connect
   * @param  {Number} [port=25567] Port from where to connect
   * @param  {String} [host='localhost'] Address from where to find the server
   * @return {Promise} Resolves if succesful or rejects with an Error
   */
  connect (password, port = 25575, host = 'localhost') {
    return Promise.race([
      new Promise(resolve => setTimeout(resolve, this.timeout, new Error(Rcon.ERR.CONNECT))),
      new Promise(resolve => {
        let data = Buffer.allocUnsafe(0);
        this.socket = net.connect({ port, host, timeout: this.timeout })
          .on('error', error => { this.events.emit('error', error); })
          .on('end', () => { this.events.emit('end'); })
          .once('error', resolve)
          .once('connect', () => {
            this.events.emit('connect');
            // Send and process authentication packet
            this.send(password, Packet.type.AUTH).then(results => {
              // Keep event list clean
              this.socket.off('error', resolve);
              if (results.pop().id !== -1) {
                this.authenticated = true;
                this.events.emit('auth');
              }
              resolve(this.authenticated ? '' : new Error(Rcon.ERR.AUTH));
            });
          })
          .on('close', () => { this.reset(); })
          .on('drain', () => { this.drain(); })
          .on('data', chunk => { // This could be made into a Transform stream
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

// Error messages generated
Rcon.ERR = {
  PACKET: 'Packet timed out!',
  CONNECT: 'Connection timed out!',
  AUTH: 'Authentication failed!'
};

module.exports = Rcon;
