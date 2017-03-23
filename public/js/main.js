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
            function Timout(){
                if(i == 0){
                    Complete();
                }else{
                    button.text(i);
                    i--;
                    setTimeout(Timout,1000);
                }
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
                $.ajax({url:'/shot',method:'post',dataType:'json',data:data});
            }
            Timout();
        }
    });

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

});