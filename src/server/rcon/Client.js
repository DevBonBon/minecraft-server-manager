const { Socket } = require('net');
const { once } = require('events');

const Packet = require(`${__dirname}/Packet.js`);
/**
 * Used to connect and send commands to a console through the RCON protocol
 */
class Client extends Socket {
  /**
   * Send a packet with given payload through the socket
   * @param  {Number} type Type to encode into the packet
   * @param  {String} payload Payload to encode into the packet
   * @param  {Number} [timeout=1500] How long to wait for a response packet
   * @return {Promise} Resolves to an array of responses or rejects with an Error
   */
  send (type, payload, timeout = 1500) {
    const id = Number.parseInt(Math.random().toString(2).substring(2, 32), 2);
    this.write(Packet.create(id, type, payload));
    this.write(Packet.create(id, Packet.request.END, ''));
    return new Promise((resolve, reject) => {
      setTimeout(reject, timeout, new Error(Client.ERROR.PACKET));
      once(this, id).then(resolve, reject);
    });
  }

  /**
   * Send the given command through an authenticated RCON connection
   * @param  {String} command Command to encode as the packet payload
   * @param  {Number} [timeout=1500] How long to wait for a response packet
   * @return {Promise} Resolves to response string or rejects with an Error
   */
  command (command, timeout = 1500) {
    return this.send(Packet.request.COMMAND, command, timeout)
      .then(packets => packets.map(packet => packet.payload).join(''));
  }

  /**
   * Connects and authenticates the RCON instance
   * @param  {String} password Password with which to connect
   * @param  {Number} [port=25567] Port which to use when connecting
   * @param  {String} [host='localhost'] Address which to connect to
   * @param  {Number} [timeout=1500] How long to wait for password verification
   * @return {Promise} Resolves to the socket itself or rejects with an Error
   */
  connect (password, port = 25575, host = 'localhost', timeout = 1500) {
    // Create the connection pipeline and send an authentication packet
    const packer = Packet.packer(packet => packet.payload === Packet.payload.END);
    super.connect(port, host).pipe(Packet.stream()).pipe(packer).on('data', packets => {
      packets.some(packet => packet.id === -1)
        ? this.emit('error', Client.ERROR.AUTH)
        : this.emit(packets.pop().id, ...packets);
    });
    return this.send(Packet.request.AUTH, password, timeout)
      .then(() => { this.emit('auth'); return this; });
  }
}
// Error messages generated
Client.ERROR = {
  PACKET: 'Packet timed out!',
  AUTH: 'Authentication failed!'
};

module.exports = Client;
