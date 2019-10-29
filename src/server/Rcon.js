const net = require('net');
const { once, EventEmitter } = require('events');

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
    this.queue = Packet.queue(packet => packet.payload === Packet.payload.END);
  }

  /**
   * Send a packet with given payload through the socket
   * @param  {String} payload Data to encode into the packet
   * @param  {Number} Type of packet to send
   * @param  {Number} [timeout=this.timeout] Timeout for packet response
   * @return {Promise} Resolves to an array of responses or rejects with an Error
   */
  send (payload, type, timeout = this.timeout) {
    const id = Packet.id();
    this.queue.write(Packet.create(id, type, payload));
    this.queue.write(Packet.create(id, Packet.type.END, ''));
    return new Promise((resolve, reject) => {
      setTimeout(reject, timeout, new Error(Rcon.ERROR.PACKET));
      once(this.events, id).then(resolve, reject);
    });
  }

  /**
   * Send the given command through an authenticated RCON connection
   * @param  {String} command
   * @param  {Number} [timeout=this.timeout] Timeout for packet response
   * @return {Promise} Resolves to response string or rejects with an Error
   */
  command (command, timeout = this.timeout) {
    return this.send(command, Packet.type.COMMAND, timeout)
      .then(packets => packets.map(packet => packet.payload).join(''));
  }

  /**
   * Connects and authenticates the RCON instance
   * @param  {String} password Password with which to connect
   * @param  {Number} [port=25567] Port from where to connect
   * @param  {String} [host='localhost'] Address from where to find the server
   * @return {Promise} Resolves if succesful or rejects with an Error
   */
  connect (password, port = 25575, host = 'localhost') {
    return new Promise((resolve, reject) => {
      this.socket = net.connect({ port, host, timeout: this.timeout })
        .on('error', error => this.events.emit('error', error))
        .on('end', () => this.events.emit('end'))
        .once('connect', () => {
          this.events.emit('connect');
          // Send and process authentication packet
          this.send(password, Packet.type.AUTH)
            .then(() => { this.events.emit('auth'); resolve(); }, reject);
        });
      this.queue.pipe(this.socket).pipe(Packet.stream()).pipe(this.queue);
      this.queue.on('dequeue', packets => {
        packets.some(packet => packet.id === -1)
          ? this.events.emit('error', Rcon.ERROR.AUTH)
          : this.events.emit(packets.pop().id, ...packets);
      });
    });
  }
}
// Error messages generated
Rcon.ERROR = {
  PACKET: 'Packet timed out!',
  AUTH: 'Authentication failed!'
};

module.exports = Rcon;
