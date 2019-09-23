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
    return Promise.race([
      new Promise(resolve => setTimeout(resolve, timeout, new Error(Rcon.ERR.PACKET))),
      new Promise(resolve => {
        this.events.once(id, resolve);
        this.queue.write(Packet.create(id, type, payload));
        this.queue.write(Packet.create(id, Packet.type.END, ''));
      })
    ]).then(result => Promise[result instanceof Error ? 'reject' : 'resolve'](result));
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
    return Promise.race([
      new Promise(resolve => setTimeout(resolve, this.timeout, new Error(Rcon.ERR.CONNECT))),
      new Promise(resolve => {
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
            }).catch(resolve);
          })
          .on('close', () => { this.reset(); });
        const packets = [];
        this.queue.pipe(this.socket).pipe(Packet.stream()).on('data', packet => {
          this.queue.emit('consume');
          packet.payload === Packet.payload.END
            ? this.events.emit(packet.id, packets.splice(0))
            : packets.push(packet);
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
