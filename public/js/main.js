jQuery(document).ready(function($){

    var stepForm = $('#step-form');

    $('#btn-back').click(function(e){
        var action = $(this).data('action');
        stepForm.attr('action',action);
    });

    $('.reset').click(function(e){
        e.preventDefault();
        e.stopPropagation();
        if(confirm('Voulez-vous redémarrer à zéro ?')){
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
                var previews = ['1-a','1-b','2-a','2-b'];
                $.ajax(
                    {
                        url:'/shot',
                        method:'post',
                        dataType:'json',
                        data:data
                    }
                ).done(function(status,data){
                    console.log(status,data);
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

    var socket = io();
    /*var socket = io.connect('http://localhost:8080');
    socket.on('news', function (data) {
        console.log(data);
        socket.emit('my other event', { my: 'data' });
    });*/

});