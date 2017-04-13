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
        }
    }
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.enable('view cache');


const HTTP_PORT=config.HTTP_PORT;
const UDP_PORT=config.UDP_PORT;

var cacheDir = './cache/';
if (!fs.existsSync(cacheDir)){
    fs.mkdirSync(cacheDir);
}

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
    var uploadDir = cacheDir+headers['x-mod-id']+'/';

    console.log('Images are posted...');
    console.log(headers);

    if (!fs.existsSync(uploadDir)){
        fs.mkdirSync(uploadDir);
    }

    var form = new multiparty.Form();

    form.parse(req, function (err, fields, files) {
        res.writeHead(200, {'content-type': 'text/plain'});
        res.write('received upload:\n\n');

        var a = files.a[0], b = files.b[0];
        function Copy(from){
            var name = from.fieldName;
            console.log('Copy '+name+'.');
            fs.copy(from.path,uploadDir+name+'.jpg',{replace:true},function(err){
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
    var message = "MASTER",
        ip = '255.255.255.255';
        //ip = '192.168.255.255';
    client.send(message, 0, message.length, UDP_PORT,ip);
    console.log('sending shot ! port :',UDP_PORT,'ip',ip);
    res.status(500).json({status:'MODULE_NOT_AVAILABLE'});
}

// Shot
app.post('/shot',shot);

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

// Home
function Home(req, res, next) {
    console.log('Home.');
    console.log(req.body);
    res.render('home', _(config).extend({layout: 'main',title:config.name}));
}
app.get('/', Home);
app.post('/', Home);

// static public
app.use(express.static('public'));

// 404
app.use(function(req, res, next) {
    res.status(404).end('404 not found \n'+req.url);
});

// Server
app.listen(HTTP_PORT, function(){
    console.log("Server listening on: http://localhost:%s", HTTP_PORT);
});