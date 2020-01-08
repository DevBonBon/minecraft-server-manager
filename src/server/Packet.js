const { Transform } = require('stream');

/**
 * Functions for managing packets used by the (Minecraft) RCON protocol
 * https://wiki.vg/RCON
 */
class Packet {
  /**
   * @param  {Number} id Packet id 32 bit Integer, client generated
   * @param  {Number} type Packet type 32 bit Integer, see 'Packet.type'
   * @param  {String} payload Packet data to be sent, encoded in 'ASCII'
   * @return {Buffer} Created packet
   */
  static create (id, type, payload) {
    // Length of payload in bytes when encoded in ASCII
    const length = Buffer.byteLength(payload, 'ascii');
    // 14 bytes for the length, id, type and 2-byte padding
    const buffer = Buffer.allocUnsafe(14 + length);
    // Offsets are hardcoded for speed
    buffer.writeInt32LE(10 + length, 0);
    buffer.writeInt32LE(id, 4);
    buffer.writeInt32LE(type, 8);
    // Null terminate the payload and the packet
    buffer.write(`${payload}\x00\x00`, 12, 'ascii');
    return buffer;
  }

  /**
   * @param  {Buffer} packet Packet which to read data from
   * @return {Object} An Object that represents the parsed packet
   */
  static read (packet) {
    return {
      // Offsets are hardcoded for speed
      length: packet.readInt32LE(0),
      id: packet.readInt32LE(4),
      type: packet.readInt32LE(8),
      payload: packet.toString('ascii', 12, packet.length - 2)
    };
  }

  /**
   * Creates a new Transform stream, that splits the buffer into packet Objects
   * @return {stream.Transform}
   */
  static stream () {
    let data = Buffer.allocUnsafe(0);
    return new Transform({
      readableObjectMode: true,
      transform (chunk, encoding, callback) {
        data = Buffer.concat([data, chunk], data.length + chunk.length);
        // 'includes' is not optimal performance wise, but it is nice to look at
        let offset = 0;
        // First 12 bytes are guaranteed to be the packet length, id and type
        while (data.includes('\x00\x00', offset + 12)) {
          // Add packet length (including the length Integer) to offset
          this.push(Packet.read(data.slice(offset, offset += data.readInt32LE(offset) + 4)));
        }
        data = data.slice(offset);
        callback();
      }
    });
  }

  /**
   * Creates a new Transform stream, that accumulates received chunks into an array.
   * Each received chunk is tested using the given separator function and if
   * truthy, the array of accumulated chunks is passed on.
   * @param  {Function} separator Defaults to behaving like a PassThrough stream
   * @return {stream.Transform}
   */
  static packer (separator = () => true) {
    const chunks = [];
    return new Transform({
      objectMode: true,
      transform (chunk, encoding, callback) {
        chunks.push(chunk);
        callback(null, separator(chunk) ? chunks.splice(0) : undefined);
      }
    });
  }
}
// Packet types understood by the server, when sent by the client
Packet.request = {
  // Invalid type that's used to detect when the full response has been received
  END: 1,
  AUTH: 3,
  COMMAND: 2
};
// Packet types sent by the server, with keys as the corresponding request type
Packet.response = {
  // Responses to invalid types are identical to command responses
  [Packet.request.END]: 0,
  [Packet.request.AUTH]: 2,
  [Packet.request.COMMAND]: 0
};
// Predefined payloads the Minecraft Server can send
Packet.payload = {
  // Message sent when a packet with an unknown type is received
  UNKNOWN: type => `Unknown request ${type.toString(16)}`,
  // Sent when a packet with above invalid type is received
  get END () {
    delete Packet.payload.END;
    return (Packet.payload.END = Packet.payload.UNKNOWN(Packet.request.END));
  }
};

module.exports = Packet;
