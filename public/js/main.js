jQuery(document).ready(function($){

    var stepForm = $('#step-form'),
        shotUid;

    $('input[type=range]').slider();
    $('[name=hostname]').val(location.hostname);
    $('[name=port]').val(location.port || 80);

    $('#btn-back').click(function(e){
        var action = $(this).data('action');
        stepForm.attr('action',action);
    });

    $('.reset').click(function(e){
        e.preventDefault();
        e.stopPropagation();
        if(confirm('Vos données seront perdues et vous retournerez à la page d\'accueil du projet.')){
            window.location.href=$(this).attr('href');
        }
    });

    if(form_autosubmit){
        function AutoSubmit(){
            setTimeout(function(){
                stepForm.submit();
            },1000);
        }
        $('input:radio')
            .on('change',AutoSubmit)
            .on('click',AutoSubmit);
    }

    $('.shoot-button').click(function(){
        var button = $(this), messageWarning = $('.shot-warning-message');
        if(!button.is(':disabled')){
            button.attr('disabled',true);
            messageWarning.show();
            var i = 4;
            function Timeout(){
                if(i == 0){
                    Complete();
                }else{
                    i--;
                    setTimeout(Timeout,1000);
                }
            }
            function ResetButton(){
                DisplayProgress();
                button.attr('disabled',false);
                messageWarning.hide();
                messageWarning.removeClass('complete');
            }
            function Complete(){
                var data = {};
                    _(stepForm.serializeArray()).each(function(o){
                        console.log(o);
                        data[o.name] = o.value;
                });
                messageWarning.addClass('complete');
                console.log(data);
                $('.pv').addClass('loading').css('backgroundImg','none');
                $.ajax(
                    {
                        url:'/shot',
                        method:'post',
                        dataType:'json',
                        data:data
                    }
                ).done(function(data,status){
                    DisplayProgress();
                    setTimeout(function(){
                        ResetButton();
                    },1000);
                    if(data.uid) shotUid = data.uid;
                    if(data.status == 'fail') alert('Les appareils photos semblent déjà occupés... '+data.error);

                }).fail(function(res,type,status){
                    console.log(arguments);
                    var data = res.responseJSON || {status:status};
                    setTimeout(function(){
                        ResetButton();
                        console.log(data);
                        switch(data.status){
                            case 'MODULE_NOT_AVAILABLE' :
                                alert('Les modules ne semblent pas disponible. La suite est donc en mode démonstration.');
                                ResultDemo();
                                break;
                        }
                    },3000);
                    //ResetButton();
                })
            }
            function DisplayProgress(){
                $('.display-progress').show();
            }
            //
            // message d'avertissement
            //
            $.ajax(
                {
                    url:'/warning',
                    method:'post',
                    dataType:'json'
                }
            ).done(function(){
                Timeout();
            })
        }
    });

    function ResultDemo(){
        stepForm.html('<iframe class="demo" href="http://polyptyque.photo"></iframe>');
    }

    $(document).ready(function(){
        // iOS web app full screen hacks.
        if(window.navigator.standalone == true) {
            // make all link remain in web app mode.
            $('a').click(function() {
                window.location = $(this).attr('href');
                return false;
            });
        }
    });

    var socket = io.connect('http://'+location.hostname+':'+location.port);
    socket.on('postImage', function (data) {
        console.log(data,shotUid);
        if(data.shotUid == shotUid){
            $('#pv-'+data.modId+'-'+data.name).removeClass('loading').css({backgroundImage:'url('+data.filePath+')'})
        }
        //socket.emit('my other event', { my: 'data' });
    });

    socket.on('progress', function(data){
        console.log('progress', data);
        $('.display-progress .message').text('... '+data.type);
        $('.display-progress .progress').css({width:(data.progress)+'%'});
    });

    socket.on('complete', function(data){
        alert('complete !');
    });

    socket.on('go_home', function(data){
        window.location.href="/"
    });

    function sendMessage(message){
        return $.ajax({
            url:'/message',
            method:'post',
            dataType:'json',
            data:message
        })
    }

    $('#hostname').submit(function(e){
        e.preventDefault();
        e.stopPropagation();

        var hostname = $('[name="hostname"]').val();
        var port = $('[name="port"]').val();
        if(hostname && port){
            sendMessage({
                action:'update_master_configuration',
                hostname:hostname,
                port:port
            })
        }
    });

    var config_xhr = false;
    $('.config-button').click(function(){
        var action = $(this).data('action'),
            options = {
                url:'/config',
                method:'post',
                headers:{
                    'x-action':action,
                    'x-from':'debug'
                }
            };
        if(action == 'set_camera_options'){
            var data = {auto:'off'};
            $("#slave-module-configuration").serializeArray().map(function(x){data[x.name] = x.value;});
            options.data = data;
        }
        if(action == 'get_status'){
            $('.slave-module').removeClass('ok ko');
        }
        config_xhr = $.ajax(options).done(function(datas){
            console.log(datas)
            config_xhr = false;
            _(datas).each(function(value,key){
               $('[name='+key+']').val(value);
               $('[type=range][name='+key+']').slider('setValue',value);
            });
        }).fail(function(e){
            config_xhr = false;
            console.log(e)
        })
    });

    // status
    socket.on('get_status', function(data){
        console.log("get_status",data.from,'.'+data.from+' > .status')
        $('.'+data.from).addClass('ok');
    });
    // status
    var logger = $('#logger');
    socket.on('logger', function(data){
        if(logger[0]){
            logger.append("<div class='level-"+data.level+"'>"+data.message+"</div>");
            logger.scrollTop(logger[0].scrollHeight);
        }
        //$('.'+data.from).addClass('ok');
    });

    function AutoSave(){
        if($('[name=auto-save]').is(':checked')){
            if(!config_xhr){
                $('.config-button[data-action=set_camera_options]').click();
            }else{
                setTimeout(AutoSave,1000);
            }
        }
    }
    $('#slave-module-configuration').find('input, select').change(AutoSave);
    // Auto sync on startup page
    //$('.config-button[data-action=get_camera_options]').click();

});