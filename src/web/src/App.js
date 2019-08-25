import React from 'react';

import axios from 'axios';

import { MuiThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import AppBar from '@material-ui/core/AppBar';
import Snackbar from '@material-ui/core/Snackbar';

import Dashboard from './Dashboard/Dashboard.js';
import Players from './Players/Players.js';
import ServerControls from './ServerControls/ServerControls.js';
import WorldControls from './ServerControls/WorldControls.js';
import Preferences from './Preferences/Preferences.js';
import About from './About/About.js';

const debug = false;

export default class App extends React.Component {
    constructor (props) {
        super(props);

        this.state = {
            debug: debug,
            ipInfo: {},
            apiSettings: {},
            minecraftStatus: {},
            minecraftStatusMessage: '',
            eulaOpen: false,
            minecraftProperties: {},
            playerInfo: {},
            value: 0
        };
        if (debug) {
            console.log('App state:', this.state);
        }
        this.handleAcceptEula = this.handleAcceptEula.bind(this);
        this.handleDeclineEula = this.handleDeclineEula.bind(this);
        this.getIpInfo = this.getIpInfo.bind(this);
        this.getMinecraftServerProperties = this.getMinecraftServerProperties.bind(this);
        this.getMinecraftStatus = this.getMinecraftStatus.bind(this);
        this.startMinecraftStatus = this.startMinecraftStatus.bind(this);
        this.stopMinecraftStatus = this.stopMinecraftStatus.bind(this);
        this.handleChange = this.handleChange.bind(this);
        this.stopMinecraftStatus = this.stopMinecraftStatus.bind(this);

        this.startMinecraftStatus();
    }

    getTheme () {
        const theme = createMuiTheme({
            "tableRowColumn": {
                "height": 60
            },
            "container": {
                "margin": 10,
                "fontFamily": '"Roboto", "Helvetica", "Arial", sans-serif',
                "fontSize": '0.95rem'
            },
            "overrides": {
                MuiButton: {
                    root: {
                        margin: "10px"
                    }
                }
            }
        });

        return theme;
    }

    componentWillUnmount () {
        if (debug) {
            console.log('Application shutting down.');
        }
        this.stopMinecraftStatus();
    }

    handleChange (event, value) {
        this.setState({ value });
    }

    getIpInfo () {
        let ipInfo;

        axios(`/api/ipInfo`).then(res => {
            ipInfo = res.data;
            this.setState({ ipInfo });
        });
    }

    getMinecraftStatus (pingWait) {
        let minecraftStatusMessage = "",
            normalPingTime = 5 * 1000,
            appendTime = 5 * 1000,
            maxTime = 120 * 1000,
            pingTime;

        // normally ping every 5 seconds
        // if a fast ping was requested (from constructor/DidMount), honor it
        // once trouble hits, add 5 seconds until 2 minutes is reached, then reset to 60 seconds
        // once re/successful, reset to 60 seconds
        if (!pingWait) {
            pingTime = normalPingTime;
        } else if (pingWait < 1000) {
            pingTime = pingWait;
        } else if (pingWait > maxTime) {
            pingTime = normalPingTime;
        } else {
            pingTime = pingWait;
        }

        if (this.statusTimerId) {
            clearTimeout(this.statusTimerId);
        }

        this.statusTimerId = setTimeout(() => {
            axios(`/api/status`).then(res => {
                let apiSettings = res.data.apiSettings;
                let minecraftProperties = res.data.minecraftProperties;
                this.setState({ apiSettings });
                this.setState({ minecraftProperties });
                if (!minecraftProperties.settings.javaHome || !minecraftProperties.settings.javaPath) {
                    minecraftStatusMessage = `Java is not properly installed.`;
                } else if (!minecraftProperties.started) {
                    minecraftStatusMessage = `Minecraft is not running.`;
                } else if (!minecraftProperties.acceptedEula) {
                    minecraftStatusMessage = `The Minecraft EULA needs to be accepted.`;
                }
                this.setState({ minecraftStatusMessage });

                if (debug) {
                    console.log('Setting Minecraft status poller to run in', pingTime/1000, 'seconds.');
                }
                this.getMinecraftStatus();
            },
            err => {
                let minecraftStatus = {};

                this.setState({ minecraftStatus });
                pingTime = pingTime + appendTime;

                if (debug) {
                    console.log('Error occurred:', err);
                    console.log('Application state:', this.state);
                    console.log('Setting Minecraft status poller to run in', pingTime/1000, 'seconds.');
                }
                this.getMinecraftStatus(pingTime);
            });
        }, pingTime);
    }

    getMinecraftServerProperties () {
        if (debug) {
            console.log('Retrieving Minecraft Server properties.');
        }

        axios(`/api/properties`).then(res => {
            let minecraftServerProperties = res.data;
            minecraftServerProperties = minecraftServerProperties.properties;
            this.setState({ minecraftServerProperties });
            if (debug) {
                console.log('MinecraftServer properties:', minecraftServerProperties);
            }
        },
        err => {
            console.log('An error occurred contacting the Minecraft server.', err);
        }).catch(e => {
            console.log('An error occurred getting the server properties:', e);
        });
    }

    handleAcceptEula () {
        axios({
            method: 'post',
            url: '/api/acceptEula'
        }).then(() => {
            this.setState({ eulaOpen: false });
        }, error => {
            console.log('error:', error);
            this.setState({ eulaOpen: false });
        }).catch(error => {
            console.log('error:', error);
            this.setState({ eulaOpen: false });
        });
    }

    handleDeclineEula () {
        axios({
            method: 'post',
            url: '/api/stop'
        }).then(() => {
            this.setState({ eulaOpen: false });
        }, error => {
            console.log('error:', error);
            this.setState({ eulaOpen: false });
        }).catch(error => {
            console.log('error:', error);
            this.setState({ eulaOpen: false });
        });
    }

    runOnce () {
        this.getIpInfo();
        this.getMinecraftServerProperties();
    }

    startMinecraftStatus () {
        this.runOnce();
        this.getMinecraftStatus(25);
    }

    stopMinecraftStatus () {
        if (debug) {
            console.log('Stopping Minecraft server poller.');
        }

        if (this.statusTimerId) {
            clearTimeout(this.statusTimerId);
        }

        if (this.playersTimerId) {
            clearTimeout(this.playersTimerId);
        }
    }

    render () {
        let minecraftProperties = this.state.minecraftProperties;

        return (
            <MuiThemeProvider theme={ this.getTheme() }>
                <AppBar position="static">
                    <Tabs
                        value = { this.state.value }
                        onChange = { this.handleChange }
                        centered>
                        <Tab label="Dashboard" />
                        <Tab label="Players" />
                        <Tab label="World Controls" />
                        <Tab label="Server Controls" />
                        <Tab label="Preferences" />
                        <Tab label="About" />
                    </Tabs>
                </AppBar>
                { this.state.value === 0 && <Dashboard
                    ipInfo = { this.state.ipInfo }
                    minecraftProperties = { minecraftProperties }
                /> }
                { this.state.value === 1 && <Players
                    minecraftProperties = { minecraftProperties }
                /> }
                { this.state.value === 2 && <WorldControls
                    minecraftProperties = { minecraftProperties }
                    startMinecraftStatus = { this.startMinecraftStatus }
                    stopMinecraftStatus = { this.stopMinecraftStatus }
                /> }
                { this.state.value === 3 && <ServerControls
                    minecraftProperties = { minecraftProperties }
                    startMinecraftStatus = { this.startMinecraftStatus }
                    stopMinecraftStatus = { this.stopMinecraftStatus }
                /> }
                { this.state.value === 4 && <Preferences
                    apiSettings = { this.state.apiSettings }
                /> }
                { this.state.value === 5 && <About
                    minecraftProperties = { minecraftProperties }
                /> }
                <Snackbar
                    anchorOrigin = {
                        {
                            vertical: 'bottom',
                            horizontal: 'left'
                        }
                    }
                    open = { !minecraftProperties.started }
                    message = { this.state.minecraftStatusMessage }
                />
            </MuiThemeProvider>
        );
    }
}
