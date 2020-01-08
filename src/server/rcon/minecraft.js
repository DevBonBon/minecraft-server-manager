const { spawn } = require('child_process');

const Client = require('./Client.js');
const IOServer = require('./IOServer.js');

const client = (new Client()).unref();
const server = (new IOServer()).unref();

const mc = spawn('/path/to/java', ['-jar', '/path/to/server.jar', 'nogui'], { cwd: '/path/to' });

client
  .on('connect', () => console.log('connected'))
  .on('auth', () => console.log('authenticated'))
  .on('error', error => console.log(error))
  .on('end', () => { console.log('ended'); client.end(); });

server.listen(mc)
  .then(() => {
    return client.connect('password', 25575, 'localhost', 40000);
  }).then(() => {
    console.log('Connected and authenticated.');
    return client.command('/op superman');
  })
  .then(response => {
    console.log(`Result of op: ${response}`);
    return client.command('/deop superman');
  })
  .then(response => {
    console.log(`Result of deop: ${response}`);
    return client.command('/help');
  })
  .then(response => {
    console.log(`Result of helps: ${response}`);
  })
  .catch(error => {
    console.error(`An error occured: ${error}`);
  });
