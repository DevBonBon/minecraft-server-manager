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
    this.reset();
  }

  /**
   * Resets the internal state
   */
  reset () {
    this.queue = Packet.queue(2);
    this.authenticated = false;
  }

  /**
   * Send a packet with given payload through the socket
   * @param  {String} payload Data to encode into the packet
   * @param  {Number} [type=Packet.type.COMMAND] Type of packet to send
   * @return {Promise} Resolves to an array of responses or rejects with an Error
   */
  send (payload, type, timeout = this.timeout) {
    const id = Packet.id();
    this.queue.write(Packet.create(id, type, payload));
    this.queue.write(Packet.create(id, Packet.type.END, ''));
    return Promise.race([
      new Promise((resolve, reject) => setTimeout(reject, timeout, new Error(Rcon.ERR.PACKET))),
      once(this.events, id)
    ]).catch(error => Promise.reject(error));
  }

  /**
   * Send the given command through an authenticated RCON connection
   * @param  {String} command
   * @param  {Number} [timeout=this.timeout] Timeout for packet response
   * @return {Promise} Resolves to response string or rejects with an Error
   */
  command (command, timeout = this.timeout) {
    return !this.authenticated
      ? Promise.reject(new Error(Rcon.ERR.AUTH))
      : this.send(command, Packet.type.COMMAND, timeout)
        .then(packets => packets.map(packet => packet.payload).join(''))
        .catch(error => Promise.reject(error));
  }

  /**
   * Connects and authenticates the RCON instance
   * @param  {String} password Password with which to connect
   * @param  {Number} [port=25567] Port from where to connect
   * @param  {String} [host='localhost'] Address from where to find the server
   * @return {Promise} Resolves if succesful or rejects with an Error
   */
  connect (password, port = 25575, host = 'localhost') {
    this.socket = net.connect({ port, host, timeout: this.timeout })
      .on('error', error => { this.events.emit('error', error); })
      .on('end', () => { this.events.emit('end'); })
      .on('close', () => { this.reset(); })
      .once('connect', () => {
        this.events.emit('connect');
        // Send and process authentication packet
        this.send(password, Packet.type.AUTH).then(result => {
          this.authenticated = result.pop().id !== -1
            ? this.events.emit('auth')
            : this.events.emit('error', new Error(Rcon.ERR.AUTH));
        }).catch(error => this.events.emit('error', error));
      });
    const packets = [];
    this.queue.pipe(this.socket).pipe(Packet.stream()).on('data', packet => {
      this.queue.emit('consume');
      packet.payload === Packet.payload.END
        ? this.events.emit(packet.id, ...packets.splice(0))
        : packets.push(packet);
    });
    return Promise.race([
      new Promise((resolve, reject) => setTimeout(reject, this.timeout, new Error(Rcon.ERR.CONNECT))),
      once(this.events, 'auth')
    ]).catch(error => Promise.reject(error));
  }
}

// Error messages generated
Rcon.ERR = {
  PACKET: 'Packet timed out!',
  CONNECT: 'Connection timed out!',
  AUTH: 'Authentication failed!'
};

module.exports = Rcon;
