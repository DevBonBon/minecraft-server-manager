// NodeJS Imports
// var https = require('https');
// var http = require('http');
const express = require('express');

// minecraft-server-manager Imports
const MSMUtil = require('../util/util');
const Util = new MSMUtil();
const MinecraftServer = require('../server/MinecraftServer');

const debugApi = false;

/**
 * Wraps MinecraftServer methods, getters and setters into an ExpressJS instance,
 * that can then be used as a server to send and receive data from the manager
 * @extends MinecraftServer
 */
class MinecraftApi extends MinecraftServer {
    constructor (workdir) {
        super(workdir);
        this.webserver = express();
        this.webserver.use(express.urlencoded({ extended: false }));
        this.webserver.use(function (request, response, next) {
            response.setHeader('Access-Control-Allow-Origin', '*');
            response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
            response.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
            response.setHeader('Access-Control-Allow-Credentials', true);
            next();
        });
        // Setters: put, with value as {value: [value]}
        // Getters: get, with response as what the getter returns
        // Functionns: post, with arguments as {arguments: [[arguments]]}, with response as what the function returns, or an error
        Object.entries(Object.getOwnPropertyDescriptors(MinecraftServer)).map(([key, descriptor]) => {
            switch ('function') {
              case typeof descriptor.set:
                  this.webserver.put(`/${key}`, (request, response) => {
                      this[key] = request.params.value;
                  });
                  break;
                case typeof descriptor.get:
                    this.webserver.get(`/${key}`, async (request, response) => {
                        response.send(await this[key]);
                    });
                    break;
                case typeof descriptor.value:
                    this.webserver.post(`/${key}`, async (request, response) => {
                        try {
                            response.send(await this[key](...request.params.arguments));
                        } catch (error) {
                            response.send(error)
                        }
                    });
                    break;
            }
        });
    }

    /**
     * Sets the paths for the ExpressJS app to serve.
     */
    async connectMinecraftApi () {
        let properties = this.properties;
        let app = this.webserver;

        app.get('/api/properties', function (request, response) {
            response.contentType('json');
            response.json({
                properties: this.properties.serverProperties
            });
        });
        app.get('/api/refreshServerProperties', async function (request, response) {
            await this.getServerProperties();
            response.contentType('json');
            response.json({
                properties: this.properties.serverProperties
            });
        }.bind(this));
        app.get('/api/status', function (request, response) {
            let props = {};
            let apiSettings = Object.assign({}, properties.settings);
            // Some things in the MinecraftServer.properties cannot be sent back to the browser, so clone and prune.
            let serverProps = Object.assign({}, this.properties);
            delete serverProps.serverProcess;
            delete serverProps.startedTimer;
            serverProps.nodeInfo = properties.nodeInfo;

            props.apiSettings = apiSettings;
            props.minecraftProperties = serverProps;

            response.contentType('json');
            try {
                JSON.stringify(props);
                response.json(props);
            } catch (err) {
                console.log(`An error occurred: ${err}`);
                response.json({
                    error: err,
                    response: 'An error occurred.'
                });
            } finally {
                apiSettings = null;
                serverProps = null;
            }
        });
        app.get('/api/userCache', function (request, response) {
            response.contentType('json');
            response.json({
                userCache: this.properties.userCache
            });
        });
        app.get('/api/whitelist', function (request, response) {
            response.contentType('json');
            response.json({
                whitelist: this.properties.whitelist
            });
        });
        app.post('/api/acceptEula', async function (request, response) {
            response.contentType('json');
            try {
                await this.acceptEula();
                await this.startMinecraft();
                response.json({
                    response: 'eula accepted'
                });
            } catch (err) {
                console.log('An error occurred accepting the Minecraft EULA.');
                console.log(JSON.stringify(err));
                response.json({
                    error: err,
                    response: 'unable to accept eula'
                });
            }
        }.bind(this));
        app.post('/api/backupWorld', async function (request, response) {
            response.contentType('json');
            try {
                await this.backupWorld();
                response.json({
                    response: 'world backup complete'
                });
            } catch (err) {
                response.json({
                    error: err
                });
            }
        });
        app.post('/api/command', async function (request, response) {
            let command = request.query.command;

            response.contentType('json');
            try {
                if (this.properties.started) {
                    let output = await this.runCommand(command);
                    response.json({
                        output: output
                    });
                } else {
                    response.json({
                        output: ""
                    });
                }
            } catch (err) {
                // TODO???
            }
        });
        app.post('/api/install', async function (request, response) {
            response.contentType('json');
            try {
                await this.install(request.query.version);
                await this.startMinecraft();
                response.json({
                    response: 'installed'
                });
            } catch (err) {
                response.json({
                    response: 'installation failed'
                });
            }
        }.bind(this));
        app.post('/api/newWorld', async function (request, response) {
            response.contentType('json');
            try {
                await this.newWorld(JSON.parse(request.query.backup));
                response.json({
                    response: 'New world created.'
                });
            } catch (err) {
                response.json({
                    error: err
                });
            }
        });
        app.post('/api/restart', async function (request, response) {
            response.contentType('json');

            try {
                await this.restartMinecraft();
                response.json({
                    response: 'restarted'
                });
            } catch (err) {
                response.json({
                    error: err
                });
            }
        }.bind(this));
        app.post('/api/saveMinecraftProperties', async function (request, response) {
            let newProperties = JSON.parse(request.param('newProperties'));

            response.contentType('json');

            try {
                await this.saveProperties(newProperties);
                response.json({
                    response: 'saved'
                });
            } catch (err) {
                response.json({
                    error: err
                });
            }
        });
        app.post('/api/start', async function (request, response) {
            response.contentType('json');

            try {
                await this.startMinecraft();
                response.json({
                    response: 'started'
                });
            } catch (err) {
                response.json({
                    error: err
                });
            }
        }.bind(this));
        app.post('/api/stop', async function (request, response) {
            response.contentType('json');

            try {
                await this.stopMinecraft();
                response.json({
                    response: 'stopped'
                });
            } catch (err) {
                response.json({
                    error: err
                });
            }
        }.bind(this));
        app.post('/api/saveApiPreferences', async function (request, response) {
            let settings = JSON.parse(request.param('settings'));
            this.properties.settings = Object.assign(this.properties.settings, settings);

            response.contentType('json');

            try {
                await Util.saveSettings(this.properties.settingsFileName, this.properties.settings);
                response.json({
                    response: 'api preferences saved'
                });
            } catch (err) {
                response.json({
                    error: err
                });
            }
        }.bind(this));
    }

    /** Starts the MinecraftApi ExpressJS instance and MinecraftServer if configured. */
    async start () {
        console.log('Starting MinecraftApi...');

        let properties = this.properties;
        let app = properties.app;
        let autoStartMinecraft = properties.settings.autoStartMinecraft || apiProperties.settings.autoStartMinecraft;

        try {
            if (autoStartMinecraft) {
                await this.startMinecraft();
            }

            await this.connectMinecraftApi();

            // TODO: These appear to be broken. Determine if need fixing (might for SSL-everywhere).
            // http.createServer(app).listen(8080, properties.settings.ipAddress, function () {
            //     let url = 'http://' + this.address().address + ':' + this.address().port;
            //     console.log('Web application running at ' + url);
            // });
            // https.createServer(app).listen(8443, properties.settings.ipAddress, function () {
            //     let url = 'https://' + this.address().address + ':' + this.address().port;
            //     console.log('Web application running at ' + url);
            // });
        } catch (err) {
            // TODO ???
        }
    }

    /**
     * Stops the MinecraftApi instance and the associated MinecraftServer if running.
     */
    async stop () {
        try {
            console.log('Stopping MinecraftApi...');
            await this.stopMinecraft();
            await Util.saveSettings(this.properties.settingsFileName, this.properties.settings);
            console.log('MinecraftApi stopped.');
        } catch (err) {
            // TODO ???
        }
    }

    /**
     * Polls the MinecraftServer instance for information. This method caches the results for display
     * by the Minecraft Server web pages to prevent catastrophic actions on the MinecraftServer.
     * @param {number} pingWait An optional number of milliseconds to wait before polling the MinecraftServer.
     * By default, pingWait is 10 seconds.
     */
    async pollMinecraft (pingWait) {
        let normalPingTime = 10 * 1000,
            appendTime = 1 * 1000,
            maxTime = 300 * 1000,
            pingTime;

        // Normally ping every 10 seconds.
        // If a fast ping was requested (from constructor or startMinecraft, etc.), honor it.
        // Once trouble hits, add 1 second until 5 minutes is reached, then reset to 10 seconds.
        // Once trouble fixed/successful, reset to 10 seconds.
        if (!pingWait) {
            pingTime = normalPingTime;
        } else if (pingWait < 1000) {
            pingTime = pingWait;
        } else if (pingWait > maxTime) {
            pingTime = normalPingTime;
        } else {
            pingTime = pingWait;
        }

        if (this.properties.pollers.minecraftStatusTimerId) {
            clearTimeout(this.properties.pollers.minecraftStatusTimerId);
        }

        this.properties.pollers.minecraftStatusTimerId = setTimeout(async () => {
            if (this.properties.minecraftServer.properties.installed && this.properties.minecraftServer.properties.started) {
                pingTime = normalPingTime;
                await this.properties.minecraftServer.updateStatus();
                if (debugApi) {
                    console.log('Got Minecraft status:');
                    console.log(this.properties.minecraftServer.properties);
                }

                if (debugApi) {
                    console.log(`Setting Minecraft status poller to run in ${pingTime/1000} seconds.`);
                }
                await this.pollMinecraft(pingTime);
            } else {
                pingTime = pingTime + appendTime;
                await this.pollMinecraft(pingTime);
            }
        }, pingTime);
    }

    /**
     * Stops the polling of the MinecraftServer.
     */
    stopMinecraftPoller () {
        let properties = this.properties;

        if (properties.pollers.minecraftStatusTimerId) {
            clearTimeout(properties.pollers.minecraftStatusTimerId);
        }
    }

    /**
     * Starts the MinecraftServer instance.
     */
    async startMinecraft () {
        try {
            let properties = this.properties;
            let minecraftServer = properties.minecraftServer;
            if (minecraftServer.properties.installed) {
                console.log(`Starting MinecraftServer...`);
                await minecraftServer.start();
                console.log(`MinecraftServer started.`);
                await this.pollMinecraft();
            }
        } catch (err) {
            console.log("Unable to start MinecraftServer.");
            console.log(err.message);
        }
    }

    /**
     * Stops the MinecraftServer instance.
     */
    async stopMinecraft () {
        let properties = this.properties;
        let minecraftServer = properties.minecraftServer;

        this.stopMinecraftPoller();

        try {
            await minecraftServer.stop();
        } catch (err) {
            console.log(err.message);
        }
    }

    /**
     * Stops and starts the MinecraftServer instance.
     */
    async restartMinecraft () {
        try {
            await this.stopMinecraft();
            await this.startMinecraft();
        } catch (err) {
            console.log(err.message);
        }
    }

    /**
     * Logs things to a file.
     * @param {string} data The data to log.
     */
    async log (data) {
        await Util.log(data, 'minecraft-api.log');
    }

    /**
     * Clears the log file.
     */
    async clearLog () {
        await Util.clearLog('minecraft-api.log');
    }
}

module.exports = MinecraftApi;
