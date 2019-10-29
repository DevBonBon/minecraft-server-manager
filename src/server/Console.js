const net = require('net');
const { EOL } = require('os');
const { Transform } = require('stream');

const Rcon = require(`${__dirname}/Rcon.js`);
const Packet = require(`${__dirname}/Packet.js`);
/**
 * Used to send and parse commands to the Minecraft Server
 */
class Console extends Rcon {
  // Seed: [?(-?.+)]?
  // output (at least one line)
  // Seed: [?(-?.+)]?
  static input () {
    return new Transform({
      transform (payload, encoding, callback) {
        // We write everything in one go, to avoid any user generated output from
        // appearing in between wanted responses (verify this)
        this.push(`/seed${EOL}${payload}${EOL}/seed${EOL}`);
        callback();
      }
    });
  }

  // This seems inefficient
  static output () {
    let data = '';
    return new Transform({
      transform (chunk, encoding, callback) {
        data += chunk;
        console.log(data);
        let match;
        while ((match = Console.lineRegExp.exec(data)) !== null) {
          this.push(match[1]);
        }
        data = data.slice(Console.lineRegExp.lastIndex);
        Console.lineRegExp.lastIndex = 0;
        console.log(data)
      }
    });
  }

  constructor (child, rcon, seed, timeout) {
    super(timeout);
    this.server = net.createServer();
    this.server.once('end', () => this.reset());
    this.server.once('connection', client => {
      client.queue = [];
      let firstSeed = false;
      let atLeastOneLine = false;
      this.queue = Packet.queue(line => {
        console.log(line)
        if (line === seed) {
          if (!firstSeed) {
            firstSeed = true;
            return false;
          }
          if (atLeastOneLine) {
            firstSeed = false;
            atLeastOneLine = false;
            return true;
          }
        }
        if (!firstSeed) {
          return true;
        }
        atLeastOneLine = true;
        return false;
      });
      this.queue.pipe(Console.input()).pipe(child.stdin);
      child.stdout.pipe(Console.output()).pipe(this.queue);
      this.queue.on('dequeue', response => {
        client.write(Packet.create(client.queue.pop(), Packet.type.COMMAND_RES, ...response));
      });
      client.pipe(Packet.stream()).on('data', packet => {
        switch (packet.type) {
          // We don't keep track of passwords
          case Packet.type.AUTH:
            client.authenticated = true;
            client.write(Packet.create(packet.id, Packet.type.AUTH_RES, ''));
            break;
          case Packet.type.COMMAND: {
            if (client.authenticated) {
              client.queue.push(packet.id);
              this.queue.write(packet.payload);
            } else {
              client.write(Packet.create(-1, Packet.type.AUTH_RES, ''));
            }
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
Console.lineRegExp = /\[\d{2}:\d{2}:\d{2}\] \[.*\]: (\w+)\r?\n/g;

module.exports = Console;
