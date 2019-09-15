const lengthError = {
  VARINT: 'VarInt is longer than 5 bytes!',
  STRING: 'String is longer than 32767 characters!'
};
/**
 * Minimal Protocol Buffer implementation for using Minecraft Server List Ping
 * https://wiki.vg/Protocol#Definitions
 * https://wiki.vg/Server_List_Ping
 */
module.exports = class ProtocolBuffer {
  // https://wiki.vg/Protocol#Definitions
  // Protocol buffers, but not quite, Minecraft style!
  // NOTE: We don't check that the given values are within the size constraints
  constructor (buffer = Buffer.alloc(0)) {
    this.buffer = buffer;
  }

  /**
   * @param  {ProtocolBuffer} packet Packet to wrap
   * @return {Buffer} The buffer with its length prefixed, ready to be sent
   */
  static wrap (packet) {
    return Buffer.concat([new ProtocolBuffer().writeVarInt(packet.buffer.length).buffer, packet.buffer]);
  }

  /**
   * Expands the buffer by one byte and writes the given value
   * @param  {Number} value Max one byte long unsigned Integer to be written
   * @return {ProtocolBuffer} Return this
   */
  writeUByte (value) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from([value])]);
    return this;
  }

  /**
   * @param  {Number} value Max two bytes long unsigned Integer to be written
   * @return {ProtocolBuffer} Return this
   */
  writeUShort (value) {
    // Write the two bytes separately
    return this.writeUByte(value >> 8).writeUByte(value & 0xFF);
  }

  /**
   * https://wiki.vg/Protocol#VarInt_and_VarLong
   * Write the given value as a VarInt
   * @param  {Number} value Max 5 bytes long Integer to be written
   * @return {ProtocolBuffer} Return this
   */
  writeVarInt (value, length = 0) {
    if (length <= 5) {
      // Check if value is only 7 bits long
      if ((value & 0xFFFFFF80) === 0) {
        // Just write it as is
        return this.writeUByte(value);
      } else {
        // Set the first bit to signal that the value continues in the next byte
        // And write the 7 leftmost bits
        // Then continue with the remaining bits
        return this.writeUByte((value & 0x7F) | 0x80).writeVarInt(value >>> 7, length + 1);
      }
    } else {
      throw new Error(lengthError.VARINT);
    }
  }

  /**
   * Expands the buffer and writes the given string prefixed with its length
   * @param  {String} string Max 32767 characters long string to be written
   * @return {ProtocolBuffer} Return this
   */
  writeString (string) {
    if (string.length <= 32767) {
      // Prefix the strings size
      this.writeVarInt(Buffer.byteLength(string));
      this.buffer = Buffer.concat([this.buffer, Buffer.from(string)]);
      return this;
    } else {
      throw new Error(lengthError.STRING);
    }
  }

  /**
   * Parses the next VarInt from buffer, or throws if it's of invalid length
   * @param  {Number} [offset=0] Offset from which byte to start reading
   * @param  {Number} [length=0] Internal variable to keep track of VarInts length
   * @return {Number} At most 5 bytes long signed integer
   */
  readVarInt (offset = 0, length = 0) {
    if (length <= 5) {
      const byte = this.buffer.readUInt8(offset);
      // Check the leftmost bit to see whether the VarInt is over or not
      if ((byte & 0x80) !== 128) {
        // Return the last 7 rightmost bits
        return byte & 0x7F;
      } else {
        // Attach and return the 7 rightmost bits with the rest of the VarInt
        return (this.readVarInt(offset + 1, length + 1) << 7) | byte & 0x7F;
      }
    } else {
      throw new Error(lengthError.VARINT);
    }
  }

  /*
   * Parses the next string from the buffer
   * @return {String} At most 32767 characters long string
   */
  readString (offset = 0) {
    // Get string length
    const length = this.readVarInt(offset);
    // Move the offset by length VarInt bytes
    offset += Math.ceil(length.toString(2).length / 8);
    // Read the string
    return this.buffer.toString('UTF-8', offset, offset + length);
  }
};
