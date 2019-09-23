const { Transform } = require('stream');

/**
 * Functions for managing packets used by the (Minecraft) RCON protocol
 * https://wiki.vg/RCON
 */
class Packet {
  /**
   * Generate a unique max 32 bit ID integer
   * @return {Number} Generated ID
   */
  static id () {
    return Number.parseInt(Math.random().toString(2).substring(2, 32), 2);
  }

  /**
   * Create a new packet buffer with given ID, type and payload
   * @param  {Number} id A unique max 32 bit client generated request ID
   * @param  {Number} type Type of the packet
   * @param  {String} payload Data to be sent encoded in 'ASCII'
   * @return {Buffer} Created packet
   */
  static create (id, type, payload) {
    // Length of payload in bytes when encoded in ASCII
    const length = Buffer.byteLength(payload, 'ascii');
    // 14 bytes for the length, ID, type and 2-byte padding
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
   * Parse the given packet into a JSON object
   * @param  {Buffer} packet
   * @return {Object} Parsed packet
   */
  static read (packet) {
    // Length of the rest of the packet
    const length = packet.readInt32LE(0);
    // Check if we have a valid packet with 2 null bytes of padding in the end
    if (packet.length === 4 + length && !packet.readInt16LE(packet.length - 2)) {
      // Offsets are hardcoded for speed
      return {
        length: length,
        id: packet.readInt32LE(4),
        type: packet.readInt32LE(8),
        payload: packet.toString('ascii', 12, packet.length - 2)
      };
    } else {
      throw new Error('Invalid packet!');
    }
  }

  /**
   * Creates a new Transform stream, that splits the buffer into Packets
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
        while (data.includes('\0\0', offset + 12)) {
          this.push(Packet.read(data.slice(offset, offset += data.readInt32LE(offset) + 4)));
        }
        data = data.slice(offset);
        callback();
      }
    });
  }

  static queue (maxConcurrent) {
    let concurrent = 0;
    return new Transform({
      transform (packet, encoding, callback) {
        const handler = () => {
          if (concurrent < maxConcurrent) {
            concurrent++;
            this.push(packet);
            this.off('next', handler);
          }
        };
        this.on('next', handler);
        this.emit('next');
        callback();
      }
    }).on('consume', function () { concurrent--; this.emit('next'); })
      .setMaxListeners(0); // We use the internal listener array as the queue
  }
}
// RCON packet type Integers understood by the Mineccraft Server
Packet.type = {
  AUTH: 3,
  AUTH_RES: 2,
  COMMAND: 2,
  COMMAND_RES: 0,
  // Invalid type that's used to detect when the full response has been received
  END: 255
};
// Predefined payloads the Minecraft Server can send
Packet.payload = {
  // Sent when a packet with above invalid type is received
  END: `Unknown request ${Packet.type.END.toString(16)}`
};

module.exports = Packet;
