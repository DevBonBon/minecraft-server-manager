const path = require('path');
const net = require('net');
const child = require('child_process');
const fs = require('fs-extra');
const FS = fs.constants;
const { EOL, networkInterfaces } = require('os');

const Updater = require(path.resolve(path.join('manager', 'Updater.js')));
const ProtocolBuffer = require(path.resolve(path.join('manager', 'ProtocolBuffer.js')));
const Console = require(path.resolve(path.join('manager', 'Console.js')));
/**
 * Information about the Minecraft Server executable and methods to manage it
 */
class Server {
  /**
   * Requests information about the server using the Minecraft SLP interface
   * @param  {String} server IP from where to find the server
   * @param  {Number} [port=25565] Port from where to connect
   * @param  {Number} [timeout=3000] How long to wait pefore giving up
   * @return {Promise} Resolves to response or an Error object if one occured
   */
  static async ping (server, port = 25565, timeout = 3000) {
    return new Promise((resolve, reject) => {
      let data = Buffer.allocUnsafe(0);
      const socket = net.connect({ host: server, port: port })
        .setTimeout(timeout, () => {
          socket.destroy();
          reject(new Error(`Socket timed out when connecting to [${server}:${port}]`));
        })
        .once('connect', () => {
          // Create and send a handshake
          socket.write(ProtocolBuffer.wrap(new ProtocolBuffer()
            // Packet ID
            .writeVarInt(0)
            // Minecraft Server Protocol, -1 by convention
            .writeVarInt(-1)
            // Server IP that was used to connect
            .writeString(server)
            // Port that was used to connect
            .writeUShort(port) // If >= 106 (1.9-pre4), we can use RCON
            // Next state request, 1 for status
            .writeVarInt(1)));
          // Send an empty request packet
          socket.write(ProtocolBuffer.wrap(new ProtocolBuffer().writeVarInt(0)));
        })
        .on('data', (chunk) => {
          data = Buffer.concat([data, chunk]);
          const response = new ProtocolBuffer(data);
          try {
            // Read the packet size
            const length = response.readVarInt();
            // Only continue if we've received the full packet
            if (data.length > length - response.buffer.length) {
              // We have the data we need so we can destroy the connection
              socket.destroy();
              try {
                // Skip the packet length and ID and parse the remaining data
                resolve(JSON.parse(response.readString(Math.ceil(length.toString(2).length / 8) + 1)));
              } catch (error) {
                // The data is corrupt
                reject(error);
              }
            }
          } catch (error) { /* We don't have enough data yet */ }
        })
        .once('error', (error) => {
          socket.destroy();
          reject(error);
        });
    });
  }

  /**
   * Detects and returns absolute path to the java executable found in PATH
   * @return {Promise} Resolves to the path or an Error object if one occured
   */
  static detectJava () {
    return new Promise((resolve, reject) => {
      // Requsts javas internal properties, which will be printed to 'STDERROR'
      child.exec('java -XshowSettings:properties -version', (error, stdout, stderror) => {
        if (error) {
          console.error(`Failed to detect java! \n${stderror}`);
          reject(error);
        } else {
          // RegExp that matches the line 'java.home = [path_to_home]'
          const javaHomeRegExp = /^\s*java.home/;
          resolve(path.join(stderror
            // Loop through lines as an array
            .split(EOL)
            // Find the first line that matches our regexp
            .find(line => javaHomeRegExp.test(line))
            // Split the line in two and return the joined path
            .split(/\s*=\s*/)[1], 'bin', 'java'));
        }
      });
    });
  }

  /**
   * Takes an existing saved instance of Server, or if none uses a default one
   * @type {Object}
   */
  constructor (object = Server.default) {
    this.name = object.name;
    this.file = object.file;
    this.java = object.java;
    this.version = object.version;
    this.updateUrl = object.updateUrl;
    this.arguments = object.arguments;
    // These variables are temporary and will not be saved
    this.process = null;
  }

  /**
   * Returns the data of this Server instance as an object
   * @return {Object}
   */
  export () {
    return {
      name: this.name,
      file: this.file,
      java: this.java,
      version: this.version,
      updateUrl: this.updateUrl,
      arguments: this.arguments
    };
  }

  /**
   * @return {String} Absolute path to stored Minecraft Server executable
   */
  get filePath () {
    return path.join(Server.paths.servers, this.file);
  }

  /**
   * Checks if the folder, java and Minecraft Server executables are accessible
   * If they are, the Minecraft Server executable is moved to that folder
   * If not, try to create the folder, redownload the server, or use java found in PATH
   * @param  {String} serverPath Path to where Minecraft Server executable will be moved
   * @return {Promise} Resolves to true or an Error object if one occured
   */
  async load (serverPath) {
    try {
      await Promise.all([
        // Check that the given directory can be accessed
        fs.ensureDir(serverPath)
          .catch(error => { throw error; }),
        // Check that the java executable can be accessed
        fs.access(this.java, FS.F_OK | FS.R_OK | FS.W_OK)
          .catch(error => {
            console.error(`Failed to access specified java executable: [${this.java}] \n${error}`);
            return Server.detectJava();
          })
          .then(path => {
            console.log(`Using java from ${path}`);
            this.java = path;
          })
          .catch(error => { throw error; }),
        // Check that the Minecraft Server executable can be accessed
        fs.access(this.filePath, FS.F_OK | FS.R_OK | FS.W_OK)
          .catch(error => {
            console.error(`Failed to access Minecraft Server executable: [${this.filePath}] \n${error}`);
            return Updater.download(this.version, this.filePath);
          })
          .then(gotVersion => {
            if (gotVersion !== this.version) {
              console.log('Version of downloaded server is not the one requested.');
            }
            this.version = gotVersion;
          })
          .catch(error => { throw error; })
      ]);
      await fs.copy(this.filePath, path.join(serverPath, this.file));
      return true;
    } catch (error) {
      console.error('Failed to load server!');
      return error;
    }
  }

  /**
   * Loads and starts the server
   * @param  {String} serverPath Path to where Minecraft Server executables folder
   * @param  {String} ip IP from where Minecraft Server can be reached
   * @param  {Number} port Port from which Minecraft Server can be connected to
   * @return {Promise} Resolves to server information or Error object(s) if one occured
   */
  async start (serverPath, ip, port) {
    try {
      await this.load(serverPath);
      this.process = child.spawn(
        this.java,
        [this.arguments.split(' '), '-jar', path.join(serverPath, this.file), 'nogui'],
        { cwd: serverPath }
      );
    } catch (error) {
      console.error(`Failed to start server! [${serverPath}]`);
      return error;
    }
    return new Promise((resolve, reject) => {
      let attempt = 0;
      const errors = [];
      const id = setInterval(async () => {
        attempt++;
        try {
          const result = await Server.ping(ip, port);
          clearInterval(id);
          resolve(result);
        } catch (error) {
          errors.push(error);
          if (attempt >= 20) {
            reject(errors);
          }
        }
      }, 3000);
    });
  }

  /**
   * Stops the server and removes the Minecraft Server executable
   * @param  {String} serverPath Path where Minecraft Server executable resides
   * @return {Promise} Resolves to true or an Error object if one occured
   */
  async unload (serverPath) {
    try {
      await this.stop();
      await fs.remove(path.join(serverPath, this.file));
      return true;
    } catch (error) {
      console.error(`Failed to unload server! [${serverPath}]`);
      return error;
    }
  }

  /**
   * Stops the Minecraft server process.
   * @param {function} callback An optional function to call when complete.
   */
  stop (callback) {
    console.log('Stopping MinecraftServer...');

    const properties = this.properties;
    const serverOutput = properties.serverOutput;
    const serverProcess = properties.serverProcess;
    let serverOutputCaptured = properties.serverOutputCaptured;
    const started = properties.started;
    let stoppedTimer = properties.stoppedTimer;
    let stopping = properties.stopping;

    if (started) {
      if (!serverOutputCaptured && !stopping) {
        serverOutputCaptured = true;
        stopping = true;
        properties.stopped = false;
        if (stoppedTimer) {
          clearTimeout(stoppedTimer);
          properties.serverProcess.stdout.removeListener('data', this.bufferMinecraftOutput);
        }
        serverOutput.length = 0;
        serverProcess.stdout.addListener('data', this.bufferMinecraftOutput);
        serverProcess.stdin.write('/stop\n');
        stoppedTimer = setTimeout(() => {
          this.checkForMinecraftToBeStopped(0, callback);
        }, 1000);
        // } else if (stopping && serverOutputCaptured) {
        //     clearTimeout(stoppedTimer);
        //     stoppedTimer = setTimeout(() => {
        //         this.checkForMinecraftToBeStopped(0, callback);
        //     }, 1000);
      } else {
        // Someone is using the output stream, wait a bit.
        setTimeout(() => {
          this.stop(callback);
        }, 1000);
      }
    } else {
      stopping = false;
      properties.stopped = true;
      if (typeof callback === 'function') {
        callback();
      }
    }
  }
}
/**
 * Absolute paths to folders and files used to store Map and Minecraft world data
 * @type {Object}
 */
Server.paths = {
  servers: path.resolve('servers'),
  get serverList () {
    return path.join(Server.paths.servers, 'servers.json');
  }
};
/**
 * Values for the default Server instance
 * @type {Object}
 */
Server.default = {
  /**
   * The server name / id
   * @type {String}
   */
  name: 'default',
  /**
   * The name of the server file. Will be redownloaded if not found
   * @type {String}
   */
  file: 'default.jar',
  /**
   * Absolute path to the java executable that will be used
   * If 'default' or not a valid path, one will be detected from PATH
   * @type {String}
   */
  java: 'default',
  /**
   * Version of the Minecraft Server to enforce
   * If 'latest' or the version isn't available, the newest stable one will be used
   * @type {String}
   */
  version: 'latest',
  /**
   * Link to custom Minecraft Server version manifest
   * If evaluates to false the official one will be used
   * @type {String}
   */
  updateUrl: '',
  /**
   * JVM arguments used to start the server
   * @type {String}
   */
  arguments: '-Xms768M -Xmx2G'
};

module.exports = Server;
