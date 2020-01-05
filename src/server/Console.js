const net = require('net');
const { EOL } = require('os');
const { Transform } = require('stream');

const Rcon = require(`${__dirname}/Rcon.js`);
const Packet = require(`${__dirname}/Packet.js`);
/**
 * Used to send and parse commands to the Minecraft Server
 */
class Console extends Rcon {
  /**
   * Creates a new Transform stream, that adds separators to requested payload
   * @return {stream.Transform}
   */
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

  /**
   * Creates a new Transform stream, that removes the date and log type prefix
   * from the beginning of lines
   * @return {stream.Transform}
   */
  static output () {
    let data = '';
    return new Transform({
      transform (chunk, encoding, callback) {
        const lines = `${data}${chunk}`.split(EOL);
        data = lines.pop();
        lines.forEach(line => this.push(line.replace(Console.lineRegExp, '$1')));
        callback();
      }
    });
  }

  constructor (child, seed, timeout) {
    super(timeout);
    this.seed = seed;

    this.server = net.createServer(client => {
      client.state = Console.STATES.AWAIT;

      client.queue = Packet.queue(line => {
        line = line.toString();
        switch (client.state) {
          case Console.STATES.AWAIT:
            if (line.replace(Console.seedRegExp, '$1') === this.seed) {
              client.state = Console.STATES.ACTIVE;
            }
            return true;
          case Console.STATES.ACTIVE:
            client.state = Console.STATES.FILLED;
            return false;
          case Console.STATES.FILLED:
            if (line.replace(Console.seedRegExp, '$1') !== this.seed) {
              return false;
            }
            return true;
        }
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
              client.id = packet.id;
              client.queue.write(packet.payload);
            } else {
              client.write(Packet.create(-1, Packet.type.AUTH_RES, ''));
            }
            break;
          }
          default:
            client.write(Packet.create(packet.id, Packet.type.COMMAND_RES, `Unknown request ${packet.type.toString(16)}`));
        }
      });

      client.queue.pipe(Console.input()).pipe(child.stdin);
      child.stdout.pipe(Console.output()).pipe(client.queue);
      client.queue.on('dequeue', responses => {
        if (client.state === Console.STATES.FILLED) {
          client.write(Packet.create(client.id, Packet.type.COMMAND_RES, responses.join(' ')));
          client.state = Console.STATES.AWAIT;
        }
      });
    });

    this.server.listen({ port: 25575, host: 'localhost' });
  }
}
// A RegExp that matches a Minecraft Server output line, where $1 is the message
Console.lineRegExp = /.*?]: (.+)/;
// A RegExp that matches an already parsed output line, where $1 is the seed
Console.seedRegExp = /Seed: \[(?=(-?\w+)\])\1]?/;

Console.STATES = {
  AWAIT: -1,
  ACTIVE: 0,
  FILLED: 1
};

module.exports = Console;
