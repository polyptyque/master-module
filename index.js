// express js app
var express = require('express');
var app = express();
//
var config = require('./config.json');
//
var fs = require('fs.extra');
var multiparty = require('multiparty');
var util = require('util');

const PORT=config.PORT;

var cacheDir = './cache/';
if (!fs.existsSync(cacheDir)){
    fs.mkdirSync(cacheDir);
}

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
        /*
        files.images.forEach(function(image){
           var name = image.fieldName;
            console.log(image);
        });
        */
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

// Post
app.post('/post',postImage);

// Home
app.get('/',function(req,res){
    res.send('Polyptyque master module OK.');
});

// 404
app.use(function(req, res, next) {
    res.status(404).end('404 not found \n'+req.url);
});

// Server
app.listen(PORT, function(){
    console.log("Server listening on: http://localhost:%s", PORT);
})