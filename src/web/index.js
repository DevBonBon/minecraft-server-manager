const express = require('express');

const MinecraftApi = require('../api/MinecraftApi.js');
const api = new MinecraftApi(process.env.npm_package_config_workdir);
// Serve React app @ root
api.webserver.use(express.static(`build`));
const server = api.webserver.listen(process.env.npm_package_config_port, process.env.npm_package_config_address, function () {
  console.log(`Web application running at http://${this.address().address}:${this.address().port}/`);
});

const exitHandler = () => {
    api.stop();
    server.close();
};
for (const signal of ['exit', 'SIGTERM', 'SIGINT']) {
    process.on(signal, exitHandler);
}

(async function () {
    try {
        await api.start();
    } catch (error) {
        console.log('Unable to start MinecraftApi.');
        console.log(error);
        process.exit(1);
    }
})();
