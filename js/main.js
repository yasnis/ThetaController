/*
 * Load module.
 */
var fs = require('fs');
var serialport = require('serialport');
var SerialPort = serialport.SerialPort;
var remote = require('remote');
var request = require('request');
var mkdirp = require("mkdirp");
var getDirName = require("path").dirname;
var app = remote.require('app');

/*
var MjpegConsumer = require("mjpeg-consumer");
var FileOnWrite = require("file-on-write");
var writer = new FileOnWrite({
    path: './video',
    ext: '.jpg'
});
var consumer = new MjpegConsumer();
// get session id
var sessionId = '';

var StreamViewer = new StreamViewer()
var index = 0;
StreamViewer.on('data', function(data) {
  index++;
  console.log(index + ': ' + data);
});

request({
   method: 'POST',
   uri: 'http://192.168.1.1:80/osc/commands/execute',
   body: JSON.stringify({
      name: "camera.startSession",
      parameters: {}
   })
}, function (error, response, body) {
  if (!error && response.statusCode == 200) {
     var result = JSON.parse(body);
     sessionId = result.results.sessionId;
    console.log(result, result.results.sessionId);

    console.log('getting the preview')
   request({
      method: 'POST',
      uri: 'http://192.168.1.1:80/osc/commands/execute',
      body: JSON.stringify({
         name: "camera._getLivePreview",
         parameters: {
            "sessionId": sessionId
         }
      })
   }).pipe(consumer).pipe(writer);

  } else {
     console.log(error, body);
  }
});
*/
//*

var currentRequest;
var oldState = 0;
var liveView;
var liveViewImage;
var liveViewURL;
var config_path = app.getPath('userData')+"/AppData/config";

var config = {
    "download_path":app.getPath('home')+"/Desktop/ThetaImage/",
    "SID":null,
    "fingerprint":null,
    "loadedlist":new Array(),
    "notloadedlist":new Array()
};

var imagelist = new Array();
var loadedlist = new Array();
var notloadedlist = new Array();
var loadingImage;
var loadAllImageList = true;
var lastShotImage = "";

$(function(){
    loadConfig();
    $(window).on("beforeunload",function(e){
        saveConfig();
    });
    checkSerialPort();
    initializeEvent();
});

/*
 * Interface Handling.
 */
 //イベントを初期化する
 function initializeEvent() {
     $("#statusButtons input").on("click",function () {
         console.log(this.id);
         // $(data.currentTarget).attr("id");
         var url;
         var obj = {};
         currentRequest = this.id;
         switch (currentRequest) {
             case "thetaStartSession":
                 url = "/osc/commands/execute";
                 obj.name = "camera.startSession";
                 obj.parameters = {};
                 break;
             case "thetaCheckStatus":
                 url = "/osc/state";
                 break;
             case "thetaGetLiveView":
                 url = "/osc/commands/execute";
                 obj.name = "camera._getLivePreview";
                 obj.parameters = {
                     "sessionId": config.SID
                 };
                 break;
             case "thetaGetCameraOptions":
                 url = "/osc/commands/execute";
                 obj.name = "camera.getOptions";
                 obj.parameters = {
                     "sessionId": config.SID,
                     "optionNames": [
                         "fileFormat",
                         "fileFormatSupport"
                     ]
                 };
                 break;
             case "thetaSetCameraOptions":
                 url = "/osc/commands/execute";
                 obj.name = "camera.setOptions";
                 obj.parameters = {
                     "sessionId": config.SID,
                      "options": {
                          "fileFormat": {
                              "type": "jpeg",
                              "width": 2048,
                              "height": 1024
                          }
                      }
                 };
                 break;
             case "thetaShootStill":
                 shootImage();
                 return;
                 break;
             case "thetaLoadAllImages":
                 loadAllImages();
                 return;
                 break;
             case "thetaShootMovie":
                 url = "/osc/commands/execute";
                 obj.name = "camera._startCapture";
                 obj.parameters = {
                         "sessionId": config.SID
                     };
                 break;
             case "thetaStopMovie":
                 url = "/osc/commands/execute";
                 obj = {
                     "stateFingerprint":config.fingerprint
                 }
                 break;
             case "thetaCheckForUpdates":
                 url = "/osc/checkForUpdates";
                 console.log(config.fingerprint);
                 obj = {
                     "stateFingerprint":config.fingerprint
                     };
                 break;
             case "saveConfig":
                 saveConfig();
                 return;
                 break;
             case "connectReleaseButton":
                 connectSerialPort($('#serialPortList option:selected').text());
                 return;
                 break;
             default:

         }
         sendMessage(url, obj);
     })
 }


 /*
  * Load/Save Config File.
  */
 //設定ファイルを読み込む
 function loadConfig() {
     console.log("loadConfig");
     //設定ファイルの有無を確認
     fs.stat(config_path, function (error, stats) {
         console.log(config_path, error, stats);
         if(error != null){
             console.log("Config not found.");
            //  config = {"SID":null};
         }else{
             //ファイルがある場合は読み込む
             fs.readFile(config_path, function (error, data) {
                 if (error != null) {
                     alert('error : ' + error);
                     return ;
                 }
                 config = JSON.parse(data.toString());
             });
         }
     });
 }

 //設定ファイルを保存
 function saveConfig(){
     writeFile(config_path, JSON.stringify(config), function (error) {
         if (error != null) {
             alert('error : ' + error);
         }
     });
 }

 /*
  * Serial Communication.
  */
 
//有効なシリアルポートを調べる
function checkSerialPort() {
    console.log("checkSerialPort");
    serialport.list(function (err, ports) {
        var availablePort = null;
        ports.forEach(function(port) {
            var dom = $("<option>");
            dom.attr("value", port.comName);
            dom.text(port.comName);
            if (port.comName.indexOf("usb")!=-1) {
                dom.prop('selected', true);
                availablePort = port.comName;
                console.lo("Selected port : ", port.comName);
            }
            $("#serialPortList").append(dom);
        });

        //有効なポートがあったら接続する
        if(availablePort) connectSerialPort(availablePort);
    });
}

//シリアル通信を初期化
function connectSerialPort(portname){
    console.log("connectSerialPort , ",portname);
    var serial = new SerialPort(portname, {
        baudRate: 115200,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        flowControl: false,
        parser: serialport.parsers.readline("\n")   // ※修正：パースの単位を改行で行う
    });
    serial.on("data", onSerial);
}

//シリアルでデータを受信した時の処理
function onSerial(input) {
    var buffer = new Buffer(input, 'utf8');
    // console.log("onData : ", input);
    // console.log(input);
    if(oldState == 0 && input == 1){
        shootImage();
    }
    oldState = input;
}

//撮影する
function shootImage(){
    currentRequest = "thetaShootStill";
    console.log("shootImage : ", lastShotImage);
    var url;
    var obj = {};
    url = "/osc/commands/execute";
    obj.name = "camera.takePicture";
    obj.parameters = {
            "sessionId": config.SID
        };
    sendMessage(url, obj, false, false, false);
}

//まだ読み込んでない画像を全部読み込む
function loadAllImages() {
    currentRequest = "thetaLoadAllImages";
    loadNext();
}
function loadNext(){
    if(config.notloadedlist.length>0){
        loadImage(config.notloadedlist.shift(), true);
    }else{
        console.log("loadComplete");
    }
}
function loadImage(img, loadNext){
    loadingImage = img;
    var o = {
        uri: 'http://192.168.1.1/osc/commands/execute',
        headers: { 'Content-Type': 'application/json' },
        json: true,
        keepAlive: false,
        encoding: null, // IMPORTANT
        body: { "name": "camera.getImage",
            "parameters": { "fileUri": loadingImage.uri }
        }
    };
    var owner = this;
    request.post(o, function (error, response, body) {
        if(error){
            console.log(error);
            return;
        }
        if(response.statusCode == 200){
            console.log(config.download_path+loadingImage.name);
            writeFile(config.download_path+loadingImage.name, body, encoding="binary");
            // fs.writeFile(config.download_path+loadingImage.name, body, encoding="binary");
            config.loadedlist.push(loadingImage);
            if(loadNext) owner.loadNext();
        }else{
            console.log('Connection Failure... (%d)', response.statusCode);
        }
    })
    /*
    var url;
    var obj = {};
    url = "/osc/commands/execute";
    obj.name = "camera.getImage";
    obj.parameters = {
        "fileUri": loadingImage.uri
    };
    sendMessage(url, obj);
    */
}

function loadImageList(token, num){
    console.log("loadImageList ", num);
    currentRequest = "thetaLoadImageList";
    if(num==undefined)num = 100;
    var url;
    var obj = {};
    url = "/osc/commands/execute";
    obj.name = "camera.listImages";
    obj.parameters = {
        "entryCount":num,
        "includeThumb":false
    };
    if(token == 0){
        imagelist = new Array();
    }else {
        obj.parameters.continuationToken = token;
    }
    sendMessage(url, obj);
}

function loadLastImageData(){
    console.log("loadLastImageData");
    var url = "/osc/state";
    var obj = {};
    var owner = this;
    sendMessage(url, obj, function(data){
        if(data.state._latestFileUri == ""　|| data.state._latestFileUri == lastShotImage){
            console.log("retry");
            setTimeout(owner.loadLastImageData, 300);
        }else{
            lastShotImage = data.state._latestFileUri;
            console.log("loadLastImageData : ", data.state._latestFileUri);
            loadAllImageList = false;
            loadImageList(0, 1);
        }
    });

}

function updateLiveView(){
    console.log("updateLiveView");
    if(!liveView){
        var canvas = $("#thetaLiveView").get(0);
        if ( ! canvas || ! canvas.getContext ) { return false; }
        liveView = canvas.getContext('2d');
        // liveViewImage = new Image();
        // liveViewImage.src = liveViewURL;
    }
    liveView.drawImage(liveViewImage, 0, 0);
}

//Thetaへメッセージを送信する
function sendMessage(u, o, successFunc, errorFunc, completeFunc){
    u = "http://192.168.1.1"+u;
    var d = JSON.stringify(o);
    console.log(u,"\n", d);
    if(!successFunc) successFunc = onJsonLoadSuccess;
    if(!errorFunc) errorFunc = onJsonLoadError;
    if(!completeFunc) completeFunc = onJsonLoadComplete;
    $.ajax({
        type:"post",
        url:u,
        data:d,
        contentType: 'application/json',
        dataType:"json",
        success: successFunc,
        error:errorFunc,
        complete:completeFunc
    });
}

//Thetaからの応答を処理する
function onJsonLoadSuccess(data) {
    console.log(data);
    /*
    if(currentRequest!="thetaGetLiveView" && currentRequest!="thetaLoadAllImages" && data.state != "done"){
        onJsonLoadError(data);
        return;
    }
    */

    switch (currentRequest) {
        case "thetaStartSession":
            config.SID = data.results.sessionId;
            loadImageList(0);
            break;
        case "thetaCheckStatus":
            console.log("thetaCheckStatus : ",data.fingerprint);
            config.fingerprint = data.fingerprint;
            break;
        case "thetaGetLiveView":
            break;
        case "thetaGetCameraOptions":
            break;
        case "thetaSetCameraOptions":
            break;
        case "thetaShootStill":
            loadLastImageData();
            break;
        case "thetaLoadImageList":
            console.log(data.results);
            console.log(data.results.entries);
            imagelist = imagelist.concat(data.results.entries);
            // console.log(imagelist.length);
            if(loadAllImageList && data.results.continuationToken > 0){
                loadImageList(data.results.continuationToken);
            }else{
                loadAllImageList = true;
                lastShotImage = imagelist[0].uri;

                console.log("loadComplete : ", imagelist.length);
                for (var i = 0; i < imagelist.length; i++) {
                    var uri = imagelist[i].uri;
                    var loaded = false;
                    for (var j = 0; j < config.loadedlist.length; j++) {
                        if(config.loadedlist[j] && config.loadedlist[j].uri == uri){
                            console.log("loaded : ", uri);
                            config.loadedlist.push(imagelist[i]);
                            loaded = true;
                            break;
                        }
                    }
                    for (var j = 0; j < config.notloadedlist.length; j++) {
                        if(config.notloadedlist[j] && config.notloadedlist[j].uri == uri){
                        break;
                        }
                    }
                    if(!loaded){
                        console.log("not loaded : ", uri);
                        config.notloadedlist.push(imagelist[i]);
                    }
                }
            }
            break;
        case "thetaLoadAllImages":

            break;
        case "thetaShootMovie":
            break;
        case "thetaStopMovie":
            break;
        case "thetaCheckForUpdates":
            break;
        default:

    }
}
function onJsonLoadError() {

}
function onJsonLoadComplete() {

}
function writeFile (path, contents, cb) {
  mkdirp(getDirName(path), function (err) {
    if (err) return cb(err)
    fs.writeFile(path, contents, cb)
  })
}
//*/
