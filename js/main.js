/*
$(function(){
       function test() {
           $.ajax({
               url: 'http://192.168.1.1/osc/stat',
               type:'post',
               data:null,
               contentType: 'application/json',
               dataType: 'json',
               timeout:10000,
               success: function (data){
                            console.log("success", data);
               },
               error:function (data){
                            console.log("error", data);
               }
           });
       }
       // test();
       sendMessage("/osc/state");
});
*/

/*
 * Load module.
 */
//*
var fs = require('fs');
var serialport = require('serialport');
var SerialPort = serialport.SerialPort;
var remote = require('remote');
var request = require('request');
var mkdirp = require("mkdirp");
var getDirName = require("path").dirname;
var app = remote.require('app');
var dialog = remote.require('dialog');

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
// var loadingImage;
// var loadAllImageList = true;
var lastShotImage = "";

var loadlist;

$(function(){
    loadConfig();
    $(window).on("beforeunload",function(e){
        saveConfig();
    });
    $("#appRestart").on('click', function(){location.reload();});
    $("#appResetConfig").on('click', resetConfig);
    step1();
});


/*
 * Step 00
 */
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
                 console.log("download_path : ", config.download_path);
                 $("#thetaDownloadDirectory").attr("value", config.download_path);
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

 //設定を初期化
 function resetConfig() {
     config = {
         "download_path":app.getPath('home')+"/Desktop/ThetaImage/",
         "SID":null,
         "fingerprint":null,
         "loadedlist":new Array(),
         "notloadedlist":new Array()
     };
 }
 function loadStart() {
     $(".loadingBorder").css("background-color", "#fff");
 }
 function loadEnd() {
     $(".loadingBorder").css("background-color", "#ccc");
 }

/*
 * Step 01
 */
function step1() {
    console.log("-----------------------------");
    console.log("-----------Step 01-----------");
    console.log("-----------------------------");
    searchTheta();

    $("#step_01").show();
    $("#step_02").hide();
    $("#step_03").hide();
}
//Thetaを探す
function searchTheta() {
    console.log("searchTheta");
    var url = "/osc/info";
    var obj = {};
    sendMessage(url, obj, function(data){
            console.log("searchTheta(success) : ", data);
            $("#step_01 p").text("Thetaが見つかりました。");
            $("#thetaStartSession").removeAttr("disabled");
            $("#thetaStartSession").on("click", startSession);
        },function(data){
            console.log("searchTheta(error) : ", data);
            //3秒待って再試行
            setTimeout(searchTheta, 3000);
        },
        "get"
    );
}

function startSession(){
    console.log("startSession");
    $("#thetaStartSession").attr("disabled", "disabled");
    $("#thetaStartSession").text("接続中...");
    $("#thetaStartSession").off("click");

    var url = "/osc/commands/execute";
    var obj = {};
    obj.name = "camera.startSession";
    obj.parameters = {};
    sendMessage(url, obj, function(data){
        console.log("startSession(success) : ", data);
        $("#thetaStartSession").text("接続完了");
        config.SID = data.results.sessionId;
        step2();
    },function(data){
        window.alert("接続に失敗しました。Thetaとの接続をご確認ください。");
        console.log("startSession(error) : ", data);
        $("#step_01 p").text("接続に失敗しました。");
        $("#thetaStartSession").text("接続する");
        $("#thetaStartSession").removeAttr("disabled");
        $("#thetaStartSession").on("click", startSession);
    });
}
/*
 * Step 02
 */
function step2() {
    console.log("-----------------------------");
    console.log("-----------Step 02-----------");
    console.log("-----------------------------");
    checkSerialPort();
    $("#releaseSkipButton").on('click', function () {
        step3();
        $("#releaseSkipButton").off('click');
    })
        $("#step_01").hide();
        $("#step_02").show();
        $("#step_03").hide();
}

 /*
  * Serial Communication.
  */

//有効なシリアルポートを調べる
function checkSerialPort() {
    console.log("checkSerialPort");
    serialport.list(function (err, ports) {
        var availablePort = null;
        $("#serialPortList option").remove();
        ports.forEach(function(port) {
            var dom = $("<option>");
            dom.attr("value", port.comName);
            dom.text(port.comName);
            if (port.comName.indexOf("usb")!=-1) {
                dom.prop('selected', true);
                availablePort = port.comName;
                console.log("Selected port : ", port.comName);
            }
            $("#serialPortList").append(dom);
        });

        $("#serialPortList").removeAttr("disabled");
        $("#releaseConnectButton").removeAttr("disabled");
        $("#releaseConnectButton").on('click',function () {
            connectSerialPort($('#serialPortList option:selected').text());
            step3();
        })
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

/*
 * Step 03
 */
function step3() {
    console.log("-----------------------------");
    console.log("-----------Step 03-----------");
    console.log("-----------------------------");

    setThetaButtonEnabled(true);

    $("#thetaSetDownloadDirectory").on('click', setDownloadDirectory);
    $("#thetaShootImage").on('click', shootImage);
    $("#thetaRefreshImageList").on('click', function () {
        setThetaButtonEnabled(false);
        loadImageList(0);
    });
    $("#thetaLoadAllImages").on('click', loadAllImages);
    $("#thetaLoadSelectedImages").on('click', loadSelectedImages);


    $("#step_01").hide();
    $("#step_02").hide();
    $("#step_03").show();
}
function setThetaButtonEnabled(b) {
    if(b){
        $("#thetaSetDownloadDirectory").removeAttr("disabled");
        $("#thetaShootImage").removeAttr("disabled");
        $("#thetaRefreshImageList").removeAttr("disabled");
        $("#thetaLoadAllImages").removeAttr("disabled");
        $("#thetaLoadSelectedImages").removeAttr("disabled");
        $("#thetaNotLoadedList").removeAttr("disabled");
    }else{
        $("#thetaSetDownloadDirectory").attr("disabled", "disabled");
        $("#thetaShootImage").attr("disabled", "disabled");
        $("#thetaRefreshImageList").attr("disabled", "disabled");
        $("#thetaLoadAllImages").attr("disabled", "disabled");
        $("#thetaLoadSelectedImages").attr("disabled", "disabled");
        $("#thetaNotLoadedList").attr("disabled", "disabled");
    }
}

//画像をダウンロードするフォルダを指定
function setDownloadDirectory(){
    setThetaButtonEnabled(false);
    loadStart();
    dialog.showOpenDialog({ properties: [ 'openDirectory']}, function (data) {
        loadEnd();
        console.log(data);
        if(data){
            config.download_path = data[0]+"/";
            console.log(config.download_path);
            $("#thetaDownloadDirectory").attr("value", config.download_path);
        }
        setThetaButtonEnabled(true);
    });
}

//撮影する
function shootImage(){
    setThetaButtonEnabled(false);
    var url;
    var obj = {};
    url = "/osc/commands/execute";
    obj.name = "camera.takePicture";
    obj.parameters = {
            "sessionId": config.SID
        };
    sendMessage(url, obj, function (data) {
        console.log("shootImage(success) : ", data);
        setTimeout(function(){setThetaButtonEnabled(true);},300);
    }, function (data) {
        console.log("shootImage(error) : ", data);
        window.alert("撮影に失敗しました。Thetaとの接続をご確認ください。");
        setTimeout(function(){setThetaButtonEnabled(true);},300);
    });
}

//画像の一覧を更新する
function loadImageList(token, num){
    console.log("loadImageList ", num);
    // currentRequest = "thetaLoadImageList";
    if(num==undefined)num = 10;
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
    console.log(obj);
    sendMessage(url, obj, onLoadImageList, function (data) {
        console.log("loadImageList(error) : ", data);
        window.alert("一覧の取得に失敗しました。Thetaとの接続をご確認ください。");
        setTimeout(function(){setThetaButtonEnabled(true);},300);
    });
    $("#thetaNotLoadedList option").remove();
}

function onLoadImageList(data) {
    console.log("loadImageList(success) : ", data);
    var list = data.results.entries;

    var interrupt = false;
    // var arr = config.notloadedlist;
    console.log(config.notloadedlist.length);
    for (var i = 0; i < list.length; i++) {
        var uri = list[i].uri;
        var b = false;
        var loaded = false;
        var added = false;
        for (var j = 0; j < config.loadedlist.length; j++) {
            if(config.loadedlist[j].uri == uri){
                config.loadedlist.push(list[i]);
                loaded = true;
                break;
            }
        }
        for (var j = 0; j < config.notloadedlist.length; j++) {
            if(config.notloadedlist[j].uri == uri){
                added = true;
                break;
            }
        }
        if(!loaded && !added){
            console.log(list[i].uri, loaded, added, interrupt);
            config.notloadedlist.push(list[i]);
        }else{
            interrupt = true;
        }
    }

    console.log("data.results.continuationToken : ", isNaN(data.results.continuationToken*0), interrupt);
    if(isNaN(data.results.continuationToken*0) || interrupt){
        //以降のリストは読み込まれている
        var list = new Array();
        for (var i = 0; i < config.notloadedlist.length; i++) {
            list.push(config.notloadedlist[i].uri);
        }
        list.sort();
        for (var j = list.length-1; j >=0; j--) {
            //読み込まれてないなら選択肢に追加
            var opt = $("<option>");
            opt.attr("value",list[j]);
            opt.text(list[j]);
            $("#thetaNotLoadedList").append(opt);
        }
        $("#thetaNotLoadedList").attr("size", Math.min(30, $("#thetaNotLoadedList option").length));
        setTimeout(function(){setThetaButtonEnabled(true);},300);
    }else{
        loadImageList(data.results.continuationToken);
    }
}

//まだ読み込んでない画像を全部読み込む
function loadAllImages() {
    loadlist = new Array();
    for (var i = 0; i < config.notloadedlist.length; i++) {
        loadlist.push(config.notloadedlist[i]);
    }
    loadNext();
}
function loadSelectedImages() {
    setThetaButtonEnabled(false);
    loadlist = new Array();
    var selected = $("#thetaNotLoadedList option:selected");
    console.log("loadSelectedImages", selected);
    for (var i = 0; i < selected.length; i++) {
        var uri = $(selected[i]).text();
        for (var j = 0; i < config.notloadedlist.length; j++) {
            if(uri == config.notloadedlist[j].uri){
                loadlist.push(config.notloadedlist[j]);
                break;
            }
        }
    }
    console.log("loadSelectedImages", loadlist);
    loadNext();
}
function loadNext(){
    if(loadlist.length>0){
        loadImage(loadlist[0]);
    }else{
        console.log("loadComplete");
        loadImageList(0);
    }
}
function loadImage(img){
    console.log("loadImage : ", img.uri);
    var loadingImage = img;
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
            window.alert("画像のダウンロードに失敗しました。Thetaとの接続をご確認ください。");
            return;
        }
        if(response.statusCode == 200){
            console.log(config.download_path+loadingImage.uri);
            writeFile(config.download_path+loadingImage.uri, body, encoding="binary");
            config.loadedlist.push(loadingImage);
            for (var i = 0; i < config.notloadedlist.length; i++) {
                if(config.notloadedlist[i].uri == loadingImage.uri){
                    config.notloadedlist.splice(i,1);
                    break;
                }
            }
            loadlist.shift();
            if(loadlist.length>0) owner.loadNext();
            else onLoadImageComplete();
        }else{
            console.log('Connection Failure... (%d)', response.statusCode);
        }
    })
}
function onLoadImageComplete() {
    console.log("onLoadImageComplete");
    loadImageList(0);
}

/*
 * Interface Handling.
 */

//Thetaからの応答を処理する
function onJsonLoadSuccess(data) {
    console.log(data);
}

//Thetaへメッセージを送信する
function sendMessage(u, o, successFunc, errorFunc, type){
    u = "http://192.168.1.1"+u;
    console.log(o);
    var d = JSON.stringify(o);
    if(!type) type = "post";
    console.log("sendMessage", u, d, type);

    loadStart();
    $.ajax({
        url: u,
        type:type,
        data:d,
        contentType: 'application/json',
        dataType: 'json',
        timeout:10000,
        cache: false,
        success: function(data){
            // console.log("success : ", data);
            if(!successFunc) onJsonLoadSuccess(data);
            else successFunc(data);
            loadEnd();
        },
        error:function(data){
            // console.log("error : ", data);
            if(!errorFunc) onJsonLoadError(data);
            else errorFunc(data);
            loadEnd();
        }
    });
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
