const { Server } = require('net');
const { EOL } = require('os');
const { Transform } = require('stream');
const { once } = require('events');

const Packet = require(`${__dirname}/Packet.js`);
/**
 * Emulates the Minecraft RCON Server using Standard I/O streams
 */
class IOServer extends Server {
  /**
   * Creates a new Transform stream, that adds separators to requested payload
   * @return {stream.Transform}
   */
  static input () {
    return new Transform({
      writableObjectMode: true,
      transform ({ id, type, payload }, encoding, callback) {
        // Assume the ip is already banned
        this.push(`pardon-ip 192.0.2.0${EOL}`);
        payload && this.push(`${payload}${EOL}`);
        this.push(`ban-ip 192.0.2.0 ${id},${type}${EOL}`);
        callback();
      }
    });
  }

  /**
   * Creates a new Transform stream, that removes the date and log type prefix
   * from the beginning of lines
   * @return {stream.Transform}
   */
  static format () {
    let data = '';
    return new Transform({
      encoding: 'utf8',
      transform (chunk, encoding, callback) {
        const lines = `${data}${chunk}`.split(EOL);
        data = lines.pop();
        lines.forEach(line => this.push(line.replace(IOServer.prefix, '$1')));
        callback();
      }
    });
  }

  static output () {
    return new Transform({
      writableObjectMode: true,
      transform (lines, encoding, callback) {
        const [, id, type] = lines.pop().match(IOServer.separator);
        if (id != null && type != null) {
          const response = lines.join(' ') || Packet.payload.UNKNOWN(type);
          this.push(Packet.create(id, Packet.response[type], response));
        }
        callback();
      }
    });
  }

  listen (child, port = 25575, host = 'localhost') {
    child.stdin.write('ban-ip 192.0.2.0');
    this.on('connection', client => {
      const packer = Packet.packer(line => IOServer.separator.test(line));
      client.pipe(Packet.stream()).pipe(IOServer.input()).pipe(child.stdin);
      child.stdout.pipe(IOServer.format()).pipe(packer).pipe(IOServer.output()).pipe(client);
    });
    super.listen(port, host);
    return once(this, 'listening').then(() => this);
  }
}
// A RegExp that matches a Minecraft Server output line, where $1 is the message
IOServer.prefix = /](?: CONSOLE)?:? (.+)$/;
// A RegExp that matches an already parsed output line, where $1 is the seed
IOServer.separator = /ip 192\.0\.2\.0:?(?: (\d{1,10}),(\d))?/i;

module.exports = IOServer;
