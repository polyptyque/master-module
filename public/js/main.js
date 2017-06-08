jQuery(document).ready(function($){

    var stepForm = $('#step-form'),
        shotId;

    $('input[type=range]').slider();

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

    $('.shoot-button').click(function(){
        var button = $(this);
        if(!button.is(':disabled')){
            button.attr('disabled',true);
            var i = 3;
            function Timeout(){
                if(i == 0){
                    Complete();
                }else{
                    button.text(i);
                    i--;
                    setTimeout(Timeout,200);
                }
            }
            function ResetButton(){
                button.attr('disabled',false);
                button.html('<i class="glyphicon glyphicon-camera"></i>')
                button.addClass('btn-danger')
                      .removeClass('btn-warning')
            }
            function Complete(){
                button.html('<i class="glyphicon glyphicon-flash"></i>');
                button.removeClass('btn-danger')
                    .addClass('btn-warning');
                var data = {};
                    _(stepForm.serializeArray()).each(function(o){
                        console.log(o);
                        data[o.name] = o.value;
                });
                console.log(data);
                $('.pv').addClass('loading').css('backgroundImg',false);
                $.ajax(
                    {
                        url:'/shot',
                        method:'post',
                        dataType:'json',
                        data:data
                    }
                ).done(function(data,status){
                    console.log(status,data,data.id);
                    shotId = data.id;
                    setTimeout(function(){
                        ResetButton();
                    },1000);
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
            Timeout();
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

    var socket = io.connect('http://localhost:8080');
    socket.on('postImage', function (data) {
        console.log(data,shotId);
        if(data.shotId == shotId){
            $('#pv-'+data.modId+'-'+data.name).removeClass('loading').css({backgroundImage:'url('+data.filePath+')'})
        }
        //socket.emit('my other event', { my: 'data' });
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
        if(hostname){
            sendMessage({
                action:'update_master_configuration',
                hostname:hostname
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
    })

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