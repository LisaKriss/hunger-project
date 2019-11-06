$(function () {
    AOS.init({
        once: true
    })
    $(window).on('load', function() {
        AOS.refresh();
    });
})