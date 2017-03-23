var http = require('http');
var fs = require('fs.extra');
var multiparty = require('multiparty');
var util = require('util');

const PORT=8080;

var cacheDir = './cache/';
if (!fs.existsSync(cacheDir)){
    fs.mkdirSync(cacheDir);
}

function postImage(req, res) {
    var body = [];
    var headers = req.headers;
    var userAgent = headers['user-agent'],
        uploadDir = cacheDir+headers['x-mod-id']+'/';
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
    //res.end('OK.');
}

function handleRequest(request, response){
    switch(request.url){
        case '/':
            response.end('Polyptyque master module OK.');
            break;
        case '/post':
            //if(request.method == 'post'){
                postImage(request,response);
                //response.end('Post \n');
            break;
            //}
        default:
            response.statusCode = 404;
            response.end('404 not found \n'+request.url);
    }
}

var server = http.createServer(handleRequest);

server.listen(PORT, function(){
    console.log("Server listening on: http://localhost:%s", PORT);
});