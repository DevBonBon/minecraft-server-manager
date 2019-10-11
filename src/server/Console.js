const net = require('net');
const { EOL } = require('os');
const { Duplex, Transform } = require('stream');

const Rcon = require(`${__dirname}/Rcon.js`);
const Packet = require(`${__dirname}/Packet.js`);
/**
 * Used to send and parse commands to the Minecraft Server
 */
class Console extends Rcon {
  static interface () {
    return new Duplex({
      read () {},
      write () {}
    });
  }

  // Seed: [?(-?.+)]?
  // output (at least one line)
  // Seed: [?(-?.+)]?
  static output (seed) {
    let data = '';
    return new Transform({
      transform (chunk, encoding, callback) {
        data += chunk;
        if (chunk.indexOf(EOL) !== -1) {
          data.split(EOL).forEach(line => {
            this.push(line.replace(, ''));
          });
        }
        callback();
      }
    });
  }

  constructor (child, rcon, seed, timeout) {
    super(timeout);
    let data = '';
    this.interface.pipe(child.stdin)
    child.stdout.on('data', chunk => {
      data += chunk;
      console.log(`chunk: ${chunk}`)
      const index = data.search(/\w{4}~\w{4}/);
      console.log(index)
      if (index >= 0) {
        const id = data.slice(index, index + 9);
        console.log(id)
        console.log(this.events.listenerCount(id))
        if (this.events.listenerCount(id)) {
          // stuff
          data.split(EOL).map(line => line.replace(lineStart, '').trim()).join('');
          console.log(data);
          this.events.emit(id, data);
          data = '';
        }
      }
    });
    this.server = net.createServer(client => {
      client.pipe(Packet.stream()).on('data', packet => {
        console.log(packet)
        // We don't keep track of authentication status nor passwords
        switch (packet.type) {
          case Packet.type.AUTH:
            client.write(Packet.create(packet.id, Packet.type.AUTH_RES, ''));
            break;
          case Packet.type.COMMAND: {
            const id = Math.random().toString(16).substring(2, 10).replace(/(.{4})/, '$1~');
            child.stdin.write(`${packet.payload}${EOL}`);
            child.stdin.write(`/seed${EOL}`);
            this.events.once(id, response => {
              console.log('oh snap')
              console.log(response)
              client.write(Packet.create(packet.id, Packet.type.COMMAND_RES, response));
            });
            break;
          }
          default:
            client.write(Packet.create(packet.id, Packet.type.COMMAND_RES, `Unknown request ${packet.type.toString(16)}`));
        }
      });
    });
    this.server.listen({ port: 25575, host: 'localhost' });
  }
}
// A RegExp that matches a Minecraft Server output line, where $1 is the message
Console.lineRegExp = /^\[\d{2}:\d{2}:\d{2}\] \[.*\]: (\w+)\r?\n/g;

module.exports = Console;
