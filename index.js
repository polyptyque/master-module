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
//
var _ = require('underscore');
//
var fs = require('fs.extra');
var multiparty = require('multiparty');
var util = require('util');
var request = require('request');
var targz = require('tar.gz');
//
// express handlerbars template
var exphbs  = require('express-handlebars');
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

var camera_mapping = [
    '1-b',
    '1-a',
    '2-b',
    '2-a',
    '3-b',
    '3-a',
    '4-b',
    '4-a',
    '5-b',
    '0-a',
    '5-a',
    '6-b',
    '6-a',
    '7-b',
    '7-a',
    '8-b',
    '8-a',
    '9-b',
    '9-a',
],
// shooting status
shooting = false, shooting_start,
shot_uid, shooting_responses,
cm_count = 1, cm_success = 0, cm_ips = [];

const HTTP_PORT=config.HTTP_PORT;
const UDP_PORT=config.UDP_PORT;
const UDP_ALL_IP = '255.255.255.255';

var cacheDir = 'cache/';
if (!fs.existsSync(cacheDir)){
    fs.mkdirSync(cacheDir);
}


// Socket server
console.log('starting socket.io');
var http = require('http').Server(app);
var io = require('socket.io')(http);


io.on('connection', function(socket){
    socket.on('chat message', function(msg){
        io.emit('chat message', msg);
    });
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
    console.log('client UDP setBroadcast');
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
        console.log(message);
        if(cm_success == cm_count){
            AllImagesShooted();
        }
        return;
    }

    console.log('Images are posted...');
    //console.log(headers);

    if (!fs.existsSync(uploadDir)){
        fs.mkdirSync(uploadDir);
    }

    var form = new multiparty.Form();

    form.parse(req, function (err, fields, files) {
        res.writeHead(200, {'content-type': 'text/plain'});
        res.write('received upload:\n\n');

        if(!files) return console.log('Upload error',modId);

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
                    console.log('compute module',modId,'upload Done.');
                    res.end(util.inspect({fields: fields, files: files}));
                    DownloadShot();
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
    console.log('All images are shooted !');
    DownloadShot();
}

function DownloadShot(){
    var ip = cm_ips.pop();
    if(ip){
        console.log('Download from cm',ip);
        var message = {action:'send_images',uid:shot_uid},
            messageStr = JSON.stringify(message);
        client.send(messageStr, 0, messageStr.length, UDP_PORT, ip);
        //DownloadShot();
    }else{
        // Toutes les images ont été téléchargées.
        shooting = false;
        ArchiveShot();
    }
}

function ArchiveShot(){
    //
    // Archive shot and send to web server
    //
    var shotDirPath = cacheDir+shot_uid,
        shotArchivePath = shotDirPath+'.tar.gz';
    //

    function UploadToWebServer(err){

        if(err) return console.log(err);

        var ellapsed_time = (new Date()).getTime() - shooting_start;
        console.log('All images successfully downloaded & archived in %s ms.',ellapsed_time);

        var req = request.post('http://polyptyque.photo/upload', function (err, res, body) {
            if (err) {
                return console.error('Upload failed:', err);
            }
            console.log('Upload successful!  Server responded with:', body);
        });
        var form = req.form(),
            form_response = {};
        form.append('uid',shot_uid);
        form.append('form_responses',JSON.stringify(shooting_responses));
        form.append('signature',sha1(secret.private_key+shot_uid));
        form.append('archive', fs.createReadStream(shotArchivePath));
    }
    //
    targz().compress(shotDirPath,shotArchivePath,UploadToWebServer)
}

// Ask camera shot from web interface
function shot(req,res,next){
    if(!shooting) {
        shooting = true;
        shooting_start = (new Date()).getTime();
        shooting_responses = _({}).extend(req.body);
        cm_ips = [];
        cm_success = 0; // reset the Compute Module success count
        var uid = shot_uid = (new Date()).getTime() + '_' + sha1(Math.random()), message = {action: "shot", uid: uid},
            messageStr = JSON.stringify(message);
        client.send(messageStr, 0, messageStr.length, UDP_PORT, UDP_ALL_IP);
        console.log('sending shot ! port :', UDP_PORT, 'ip', UDP_ALL_IP);
        res.status(200).json({status: 'ok', uid: message.uid});
    }else{
        res.status(200).json({status: 'fail'});
    }
}

// Shot
app.post('/shot',shot);


// Configuration global post entry
function configAction(req,res,next){
    var action = req.header('x-action'),
        from = req.header('x-from');
    if(action == 'get_camera_options'){
        get_camera_options(from,req,res,next)
    }
    if(action == 'set_camera_options'){
        set_camera_options(from,req,res,next)
    }
    if(action == 'restart_camera'){
        restart_camera(from,req,res,next)
    }
    if(action == 'get_status'){
        get_status(from,req,res,next);
    }
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
        console.log('get_camera_options from',from)
        get_camera_options_timeout = false;
        res.status(200).end();
    }
}

function set_camera_options(from,req,res,next){
    sendJsonUPD({action:'set_camera_options',options:req.body});
    res.json({status:'ok'});
    console.log('set_camera_options');
}

function restart_camera(from,req,res,next){
    sendJsonUPD({action:'restart_camera'});
    res.json({status:'ok'});
    console.log('restart_camera');
}

function get_status(from,req,res,next){
    if(from == 'debug')
    {
        sendJsonUPD({action:'get_status'});
    }

    io.emit('get_status', {from:from,status:'ok'});
    res.json({status:'ok'});
    console.log('get_status',from)
}

// Config
app.post('/config',configAction);

// Send json message via UDP broadcast
function sendMessage(req,res,next){
    var message = req.body,
        messageStr = JSON.stringify(message);
    client.send(messageStr, 0, messageStr.length, UDP_PORT, UDP_ALL_IP);
    console.log('sending message ! port :',UDP_PORT,'ip',UDP_ALL_IP);
    console.log(messageStr);
    res.status(200).json({status:'ok',uid:message.uid});
}
app.post('/message',sendMessage);

// Send raw json via UDP broadcast
function sendJsonUPD(data){
    var dataStr = JSON.stringify(data);
    console.log('sendJsonUPD');
    client.send(dataStr, 0, dataStr.length, UDP_PORT, UDP_ALL_IP);
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

// static public
app.use(express.static('public'));
app.use('/cache',express.static('cache'));

http.listen(HTTP_PORT, function(){
    console.log('listening on *:' + HTTP_PORT);
    // 404
    app.use(function(req, res, next) {
        res.status(404).end('404 not found \n'+req.url);
    });
});


