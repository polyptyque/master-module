// express js app
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
//
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));
//
var config = require('./config.json');
var secret = require('./secret.json');
var sha1 = require('sha1');
var format = require('date-format');
//
var _ = require('underscore');
//
var fs = require('fs.extra');
var path = require('path');
var multiparty = require('multiparty');
var util = require('util');
var request = require('request');
var progress = require('request-progress');
var targz = require('tar.gz');
//
// express handlerbars template
var exphbs  = require('express-handlebars');
var LOG_LEVEL_ERROR = 0,
    LOG_LEVEL_WARNING = 1,
    LOG_LEVEL_DEBUG = 2,
    LOG_LEVEL_VERBOSE = 3,
    LOG_LEVEL_SUCCESS = 4;
var hbs = exphbs.create({
    helpers:{
        ifvalue:function (conditional, options) {
            if (options.hash.value === conditional) {
                //console.log('ifvalue YES',conditional,'==',options.hash.value);
                return options.fn(this)
            } else {
                //console.log('ifvalue NO',conditional,'==',options.hash.value);
                return options.inverse(this);
            }
        },
        ifequal:function(a,b,options){
            if (a === b) {
                //console.log('ifvalue YES',conditional,'==',options.hash.value);
                return options.fn(this)
            } else {
                //console.log('ifvalue NO',conditional,'==',options.hash.value);
                return options.inverse(this);
            }
        },
        for:function(from, to, incr, block) {
            var accum = '';
            for(var i = from; i <= to; i += incr)
                accum += block.fn(i);
            return accum;
        }
    }
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.enable('view cache');

function logger(message,logLevel){
    console.log(message);
    if(!(logLevel>0)) logLevel = LOG_LEVEL_VERBOSE;
    io.emit('logger',{message:message,level:logLevel});
}

var camera_mapping = [
    '1-b', // 0
    '1-a', // 1

    '2-b', // 2
    '2-a', // 3

    '3-b', // 4
    '3-a', // 5

    '4-b', // 6
    '4-a', // 7

    '5-b', // 8

    '0-a', // 9

    '5-a', // 10

    '6-b', // 11
    '6-a', // 12

    '7-b', // 13
    '7-a', // 14

    '8-b', // 15
    '8-a', // 16

    '9-b', // 17
    '9-a'  // 18
],
// shooting status
shooting = false, shooting_start,
shooting_timeout = false,
shooting_res = false,
shot_uid, shooting_responses,
cm_count = 10, cm_success = 0, cm_downloaded = 0, cm_ips = [];

const HTTP_PORT=config.HTTP_PORT;
const UDP_PORT=config.UDP_PORT;
const UDP_ALL_IP = '255.255.255.255';

var cacheDir = 'cache/';
if (!fs.existsSync(cacheDir)){
    fs.mkdirSync(cacheDir);
    fs.chmodSync(cacheDir,755);
}


// Socket server
console.log('starting socket.io');
var http = require('http').Server(app);
var io = require('socket.io')(http);


io.on('connection', function(socket){
    logger('new socket')
});

// UDP Client
const dgram = require('dgram');
var client = dgram.createSocket(
    {
        type:"udp4",
        reuseAddr:true
    }
);
client.bind(function() {
    logger('client UDP setBroadcast');
    client.setBroadcast(true);
});

function postImage(req, res) {
    var headers = req.headers;
    var shotUid = headers['x-shot-uid'],
        modId = headers['x-mod-id'],
        action = headers['x-action'],
    uploadDir = cacheDir+shotUid+'/';

    if(action=='confirm_shot'){
        var status = headers['x-status'], ip = req.ip.split(':').pop(),
            message = 'confirm shot '+shotUid+' : '+status+' ip '+ip+' modId '+modId;
        if(status == 'ok'){
            cm_success++;
            cm_ips.push(ip);
        }
        res.end(message);
        logger(message,status == 'ok' ? LOG_LEVEL_DEBUG : LOG_LEVEL_ERROR);
        if(cm_success == cm_count){
            AllImagesShooted();
        }
        return;
    }

    LogEllapsedTime('Images are posted... '+modId);
    //console.log(headers);

    cm_downloaded ++;
    //LogEllapsedTime('compute module '+modId+' upload Done.');
    //res.end("ok upload done.");
    //
    //if(cm_downloaded == cm_count){
    //    ArchiveShot();
    //}else{
    //    DownloadShot()
    //}

    var form = new multiparty.Form();

    form.parse(req, function (err, fields, files) {
        res.writeHead(200, {'content-type': 'text/plain'});
        res.write('received upload from '+modId+':\n\n');

        if(!files) return logger('Upload error '+modId);

        var a = files.a[0],
            b = files.b ? files.b[0] : false;
        function Copy(from){
            var name = from.fieldName,
                cam_abs_name = modId+'-'+name,
                position = 1+_(camera_mapping).indexOf(cam_abs_name)
            var filePath = uploadDir+position+'-'+cam_abs_name+'.jpg';
            //console.log('Copy '+name+'.',filePath);
            fs.copy(from.path,filePath,{replace:true},function(err){
                // envoie un message via socket.io
                io.emit('postImage', {filePath:filePath,shotUid:shotUid,modId:modId,name:name});
                if(err){
                    res.statusCode = '500';
                    res.end(err);
                }else if(name == 'a' && b){
                    Copy(b);
                }else{
                    cm_downloaded ++;
                    LogEllapsedTime('compute module '+modId+' upload Done. '+cm_downloaded+'/'+cm_count);
                    res.end("Success !"+cm_downloaded+'/'+cm_count);
                    //
                    if(cm_downloaded == cm_count){
                        ArchiveShot();
                    }else{
                        DownloadShot()
                    }
                    //

                }
            });
        }
        Copy(a)

    });
}

// Post Image
app.post('/post',postImage);

function AllImagesShooted(){
    // all images are shooted, start download from cm
    LogEllapsedTime('All images are shooted');
    if(shooting_timeout){
        clearTimeout(shooting_timeout);
        DownloadShot();
    }else{
        logger('but timeout..., sorry');
    }
}

function DownloadShot(){
    var message = {action:'send_images',uid:shot_uid},
        messageStr = JSON.stringify(message),
        ip = cm_ips.pop();
    logger('DownloadShot '+ip);
    //_(cm_ips).each(function(ip){
        client.send(messageStr, 0, messageStr.length, UDP_PORT, ip);
    //});
}

function ArchiveShot(){
    //
    // Archive shot and send to web server
    //
    var shotDirPath = cacheDir+shot_uid,
        shotArchivePath = shotDirPath+'.tar.gz';
    //
    //
    function UploadSFTP(){
        var shotArchivePathAbsolute = path.resolve(shotArchivePath);
        logger('Upload sftp '+shotArchivePathAbsolute+' -> '+Math.round(fs.statSync(shotArchivePathAbsolute).size/1000)+'kb');
        var message = JSON.stringify({action:"transfert_sftp",options:{filepath:shotArchivePathAbsolute, uid:shot_uid}});
        client.send(message, 0, message.length, UDP_PORT, 'localhost');
    }
    //
    targz().compress(shotDirPath,shotArchivePath,UploadSFTP)
}


function ftp_complete(req,res,next){
    res.send('Thank you for FTP transfert.');
    var url = 'http://polyptyque.photo/upload',
        data =  {
            uid: shot_uid,
            form_responses: shooting_responses,
            signature: sha1(secret.private_key + shot_uid)
        };
    logger('sftp transfert complete.');
    LogEllapsedTime('HTTP request POST on '+url);
    console.log(data);
    request.post(url,function (err, res, body) {
        if (err) {
            return console.error('Upload failed:', err);
        }
        LogEllapsedTime('Upload status code '+ res.statusCode);
        logger('Server response:'+ body);
    }).form(data);

}

function ftp_progess(req,res,next){
    res.send('thanks.');
    console.log('ftp_progess',req.body)
    io.emit('logger',{message:JSON.stringify(req.body),level:LOG_LEVEL_VERBOSE});
}

// FTP UPLOAD COMPLETE
app.post('/ftp_complete',ftp_complete);
app.post('/ftp_progess',ftp_progess);

// Ask camera shot from web interface
function shot(req,res,next){
    if(!shooting) {
        shooting = true;
        shooting_start = (new Date()).getTime();
        shooting_res = res;
        shooting_responses = _(config.default_responses).extend(req.body);
        cm_ips = [];
        cm_downloaded = 0; // reset the Compute Module downloaded count
        cm_success = 0; // reset the Compute Module success count
        var uid = shot_uid = format.asString('yyMMdd-hhmmss-',new Date()) + sha1(Math.random()).substring(0,6),
            message = {action: "shot", uid: uid},
            uploadDir = cacheDir+uid+'/';

        // on créé le dossier d'upload
        if (!fs.existsSync(uploadDir)){
            fs.mkdirSync(uploadDir);
            logger(parseInt('00777',8));
            fs.chmodSync(uploadDir, parseInt('00777',8))
        }
        shooting_res.send({status:'ok',uid:shot_uid});

        sendJsonUPD(message,'both');
        logger('sending shot ! port : '+ UDP_ALL_IP + ':'+ UDP_PORT, LOG_LEVEL_SUCCESS);
        shooting_timeout = setTimeout(function(){
            logger('shooting timeout '+config.shooting_timout+' ms for '+uid, LOG_LEVEL_WARNING );
            shooting_timeout = shooting = false;
            sendJsonUPD({action:'reset_shooting'});
            //res.status(200).json({status: 'fail', error:'timeout', uid: message.uid});
        },config.shooting_timout);

    }else{
        res.status(200).json({status: 'fail', error:'buzzy'});
    }
}

function warningBeforeShot(){
    // envoie un message avant de prendre la photo
    var messageStr = JSON.stringify({'action':'warning'});
    client.send(messageStr, 0, messageStr.length, UDP_PORT, 'localhost');
    logger("Attention... une photo va être prise dans 3 secondes",LOG_LEVEL_WARNING);
}

// Shot
app.post('/shot',shot);

// Warning (3 secondes before shot)
app.post('/shot',warningBeforeShot);


// Configuration global post entry
function configAction(req,res,next){
    var action = req.header('x-action'),
        from = req.header('x-from');
    if(action == 'get_camera_options'){
        get_camera_options(from,req,res,next)
    }else if(action == 'set_camera_options'){
        set_camera_options(from,req,res,next)
    }else if(action == 'get_status'){
        get_status(from,req,res,next);
    }else if(action == 'reset_shooting'){
        shooting = false;
        logger('reset shooting',LOG_LEVEL_WARNING)
        DefaultConfigAction(action,req,res);
    }else{
        DefaultConfigAction(action,req,res);
    }
}

function DefaultConfigAction(action,req,res){
    sendJsonUPD({action:action});
    res.json({status:'ok',action:action});
    logger('config action : '+action);
}

var get_camera_options_timeout = false,
    get_camera_options_res;
function get_camera_options(from,req,res,next){
    //
    clearTimeout(get_camera_options_timeout);
    if(from == 'debug'){
        // requete debug
        get_camera_options_timeout = setTimeout(function(){
            res.status(408).json({'timeout':5000});
        },5000);
        get_camera_options_res = res;
        sendJsonUPD({action:'get_camera_options'});
    }else{
        // retour module
        if(get_camera_options_timeout){
            get_camera_options_res.status(200).json(req.body);
        }
        logger('get_camera_options from '+from)
        get_camera_options_timeout = false;
        res.status(200).end();
    }
}

function set_camera_options(from,req,res,next){
    sendJsonUPD({action:'set_camera_options',options:req.body});
    res.json({status:'ok'});
    logger('set_camera_options');
}

function get_status(from,req,res,next){
    if(from == 'debug')
    {
        sendJsonUPD({action:'get_status'});
    }

    io.emit('get_status', {from:from,status:'ok'});
    res.json({status:'ok'});
    logger('get_status '+from)
}

// Config
app.post('/config',configAction);

// Send json message via UDP broadcast
function sendMessage(req,res,next){
    var message = req.body,
        messageStr = JSON.stringify(message);
    client.send(messageStr, 0, messageStr.length, UDP_PORT, UDP_ALL_IP);
    logger('sending message ! port : '+UDP_ALL_IP+':'+UDP_PORT);
    logger(messageStr);
    res.status(200).json({status:'ok',uid:message.uid});
}
app.post('/message',sendMessage);

// Send raw json via UDP broadcast
function sendJsonUPD(data,broadcast){
    var dataStr = JSON.stringify(data);
    if(broadcast){
        client.send(dataStr, 0, dataStr.length, UDP_PORT, UDP_ALL_IP);
    }

    if(broadcast == 'both' || !broadcast){
        _(config.modules_hosts).each(function(host){
            client.send(dataStr, 0, dataStr.length, UDP_PORT, host);
        });
    }

}

// Steps
app.use('/step-:step', function (req, res, next) {
    var step = parseInt(req.params.step),
        stepNumber = step+1,
        nextStep = (step+1),
        prevStep = (step-1),
        totalStep = config.steps.length,
        responses = _({}).extend(req.body)
        ;
    var stepConfig = config.steps[step];

    if(!stepConfig) return next();

    stepConfig.fields.forEach(function(field){

        var response = responses[field.id];
        delete responses[field.id];

        if(response){
            field.response = response;
            console.log(field.id,response)
            //field.value=responses[field.id];
        }

        if(field.type == 'radio'){
            // map id
            field.choices.forEach(function(choice,index){
                choice.id = field.id;
                choice.index = index;
                choice.checked = response == choice.value ? "checked":"";
            });
        }
    });

    console.log(responses);

    var options = {
            layout: 'main',
            title:'Polyptyque - étape '+step,
            step:step,
            stepNumber:stepNumber,
            totalStep:totalStep,
            responses:responses
        };
    console.log("step %s",step,step>=0);
    if(step>0){
        options = _.extend(options,{
            prevStep:prevStep.toString(),
            prevStepAction:'step-'+(step-1),
        })
    }else{
        options.prevStepAction = '/';
    }

    if(stepNumber<totalStep){
        options = _.extend(options,{
            nextStep:nextStep,
            nextStepAction:'step-'+(step+1),
        })
    }else{
        options.nextStepAction = 'step-complete'
    }

    options = _(options).extend(stepConfig);
    res.render('step', options);
});

function LogEllapsedTime(message){
    var ellapsed_time = (new Date()).getTime() - shooting_start,
        ellapsed_time_human = ellapsed_time + ' ms.';
    if(ellapsed_time>1000){
        ellapsed_time_human = Math.round(ellapsed_time/100)/10 + ' sec.'
    }
    if(ellapsed_time>60000){
        ellapsed_time_human = Math.round(ellapsed_time/6000)/10 + ' min.'
    }

    logger(message+' in '+ellapsed_time_human);
}

// Status
function Status(req, res, next){
    res.render('status', _(config).extend({layout: 'main',title:'console'}));
}

// Debug
function Debug(req, res, next) {
    console.log('Debug.');
    var cameraFields = [
        {id:'width',type:'number',label:'width'},
        {id:'height',type:'number',label:'height'},
        {id:'jpeg_quality',type:'range',label:'jpeg quality',min:0,max:100,step:1},
        {id:'iso',type:'select',label:'ISO',options:[100, 200, 320, 400, 500, 640, 800]},
        {id:'shutter_speed',type:'range',label:'shutter speed',min:10,max:10000000,step:10},
        {id:'exposure_compensation',type:'range',label:'exposure compensation',min:-25,max:25,step:1},
        {id:'brightness',type:'range',label:'brightness',min:0,max:100,step:1},
        {id:'contrast',type:'range',label:'contrast',min:-100,max:100,step:1},
        {id:'saturation',type:'range',label:'saturation',min:-100,max:100,step:1},
        {id:'sharpness',type:'range',label:'sharpness',min:-100,max:100,step:1},
        {id:'awb_gain_red',type:'range',label:'AWB gain red',min:0.5,max:3.5,step:0.01},
        {id:'awb_gain_blue',type:'range',label:'AWB gain blue',min:0.5,max:3.5,step:0.01},
        {id:'meter_mode',type:'select',label:'meter mode',options:['average', 'spot', 'backlit', 'matrix']},
        {id:'use_video_port',type:'select',label:'use video port',options:['on', 'off']},
        {id:'auto',type:'select',label:'mode automatique',options:['on', 'off']},
    ];
    res.render('debug', _(config).extend({layout: 'main',title:config.name,cameraFields:cameraFields}));
}
// Home
function Home(req, res, next) {
    console.log('Home.');
    console.log(req.body);
    res.render('home', _(config).extend({layout: 'main',title:config.name}));
}
app.get('/', Home);
app.post('/', Home);

app.get('/debug',Debug);
app.get('/status',Status);

// static public
app.use(express.static('public'));
app.use('/cache',express.static('cache'));

http.listen(HTTP_PORT, function(){
    logger('listening on *:' + HTTP_PORT);
    // 404
    app.use(function(req, res, next) {
        res.status(404).end('404 not found \n'+req.url);
    });
});


