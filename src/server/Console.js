const { Server } = require('net');
const { EOL } = require('os');
const { Transform } = require('stream');
const { once } = require('events');

const Packet = require(`${__dirname}/Packet.js`);
/**
 * Used to send and parse commands to the Minecraft Server
 */
class RconServer extends Server {
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
        lines.forEach(line => this.push(line.replace(RconServer.prefix, '$1')));
        callback();
      }
    });
  }

  static output () {
    return new Transform({
      writableObjectMode: true,
      transform (lines, encoding, callback) {
        const [, id, type] = lines.pop().match(RconServer.separator);
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
      const packer = Packet.packer(line => console.log(line) && RconServer.separator.test(line));
      client.pipe(Packet.stream()).pipe(RconServer.input()).pipe(child.stdin);
      child.stdout.pipe(RconServer.format()).pipe(packer).pipe(RconServer.output()).pipe(client);
    });
    super.listen(port, host);
    return once(this, 'listening').then(([self]) => self);
  }
}
// A RegExp that matches a Minecraft Server output line, where $1 is the message
RconServer.prefix = /](?: CONSOLE)?:? (.+)$/;
// A RegExp that matches an already parsed output line, where $1 is the seed
RconServer.separator = /ip 192\.0\.2\.0:?(?: (\d{1,10}),(\d))?/i;

module.exports = RconServer;
