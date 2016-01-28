'use strict';

const electron = require('electron');
// const serialport = require('serialport');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

var mainWindow = null;

app.on('window-all-closed', function(){
    // console.log(config);
    app.quit();
});

app.on('ready', function() {
    mainWindow = new BrowserWindow({width:1280, height:800});
    mainWindow.loadURL('file://' + __dirname + '/index.html');

    mainWindow.webContents.openDevTools();
    mainWindow.on('closed', function(){
        mainWindow = null;
    });
});
