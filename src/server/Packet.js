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
   * @param  {Number} id 32 bit client generated request ID
   * @param  {Number} type 32 bit TYPE of the packet, see 'Packet.type'
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
      throw new Error(Packet.ERROR.INVALID);
    }
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
          this.push(Packet.read(data.slice(offset, offset += data.readInt32LE(offset) + 4)));
        }
        data = data.slice(offset);
        callback();
      }
    });
  }

  /**
   * TODO: make this a proper description
   * I have no idea how to describe this. Its a queue you have to pipe back into
   * so it knows when new packets can be sent. Its suplied a separator function
   * to determine when to  "dequeue" accumulated packets (that propably needs a rename)
   *
   * @param  {Function} [separator=() => true]
   * @return {stream.Transform}
   */
  static queue (separator = () => true) {
    return new Transform({
      transform (packet, encoding, callback) {
        this.push(packet);
        callback();
      }
    }).on('data', function () { this.pause(); })
      .once('pipe', function (source) {
        const packets = [];
        source.unpipe(this);
        source.on('data', packet => {
          this.resume();
          packets.push(packet);
          separator(packet) && this.emit('dequeue', packets.splice(0));
        });
      });
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
// Error messages generated
Packet.ERROR = {
  INVALID: 'Buffer not a valid Packet!'
};

module.exports = Packet;
