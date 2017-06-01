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
var sha1 = require('sha1');
//
var _ = require('underscore');
//
var fs = require('fs.extra');
var multiparty = require('multiparty');
var util = require('util');
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


const HTTP_PORT=config.HTTP_PORT;
const UDP_PORT=config.UDP_PORT;

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
    var shotId = headers['x-shot-id'],
        modId = headers['x-mod-id'],
    uploadDir = cacheDir+shotId+'/';

    console.log('Images are posted...');
    console.log(headers);

    if (!fs.existsSync(uploadDir)){
        fs.mkdirSync(uploadDir);
    }

    var form = new multiparty.Form();

    form.parse(req, function (err, fields, files) {
        res.writeHead(200, {'content-type': 'text/plain'});
        res.write('received upload:\n\n');

        if(!files) return console.log('Upload error',modId);

        var a = files.a[0], b = files.b[0];
        function Copy(from){
            var name = from.fieldName,
                filePath = uploadDir+modId+'-'+name+'.jpg';
            console.log('Copy '+name+'.',filePath);
            fs.copy(from.path,filePath,{replace:true},function(err){
                // envoie un message via socket.io
                io.emit('postImage', {filePath:filePath,shotId:shotId,modId:modId,name:name});
                if(err){
                    res.statusCode = '500';
                    res.end(err);
                }else if(name == 'a'){
                    Copy(b);
                }else{
                    console.log('Upload Done.');
                    res.end(util.inspect({fields: fields, files: files}));
                }
            });
        }
        Copy(a)

    });
}

// Post Image
app.post('/post',postImage);

// Ask camera shot from web interface
function shot(req,res,next){
    var message = {action:"shot",id:sha1(Math.random())},
        messageStr = JSON.stringify(message),
        ip = '255.255.255.255';
    client.send(messageStr, 0, messageStr.length, UDP_PORT, ip);
    console.log('sending shot ! port :',UDP_PORT,'ip',ip);
    res.status(200).json({status:'DEMO',id:message.id});
}

// Shot
app.post('/shot',shot);

// Send json message via UDP
function sendMessage(req,res,next){
    var message = req.body,
        messageStr = JSON.stringify(message),
        ip = '255.255.255.255';
    client.send(messageStr, 0, messageStr.length, UDP_PORT, ip);
    console.log('sending message ! port :',UDP_PORT,'ip',ip);
    console.log(messageStr);
    res.status(200).json({status:'DEMO',id:message.id});
}
app.post('/message',sendMessage);


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
    console.log(req.body);
    res.render('debug', _(config).extend({layout: 'main',title:config.name}));
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


