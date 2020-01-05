//var RCON = require('./Rcon.js');
//var rcon = new RCON();

const { spawn } = require('child_process');
const mc = spawn('C:\\Program Files\\AdoptOpenJDK\\version\\bin\\java', ['-jar', 'C:\\path\\server.jar', 'nogui'], { cwd: 'C:\\path', stdio: ['pipe', 'pipe', 'pipe'] });
const Lcon = require('./Console.js');

let rcon = new Lcon(mc, '-2002951658904644382');

new Promise(resolve => setTimeout(resolve, 90000))
  .then(() => {
    return rcon.connect('password');
  }).then(() => {
    console.log('Connected and authenticated.');
    return rcon.command('/op superman');
  })
  .then(response => {
    console.log(`Result of op: ${response}`);
    return rcon.command('/op superman');
  })
  .then(response => {
    console.log(`Result of deop: ${response}`);
    return Promise.all([
      rcon.command('/help'),
      rcon.command('/help'),
      rcon.command('/help'),
      rcon.command('/help'),
      rcon.command('/help'),
      rcon.command('/help'),
      rcon.command('/help')
    ]);
  })
  .then(response => {
    console.log(`Result of helps: ${response}`);
  })
  .catch(error => {
    console.error(`An error occured: ${error}`);
  });
/*
rcon.events
  .on('connect', () => console.log('connected'))
  .on('auth', () => console.log('authenticated'))
  .on('timeout', () => console.log('timeouted'))
  .on('error', error => console.log(error))
  .on('end', () => { console.log('ended'); rcon.socket.end(); });

rcon.connect('password')
  .then(() => {
    rcon.socket.unref();
    console.log('Connected and authenticated.');
    return rcon.command('/op superman');
  })
  .then(response => {
    console.log(`Result of op: ${response}`);
    return rcon.command('/deop superman');
  })
  .then(response => {
    console.log(`Result of deop: ${response}`);
    return rcon.command('/help');
  })
  .then(response => {
    console.log(`Result of help: ${response}`);
  })
  .catch(error => { console.error(error); });
*/
