// Android TV shell shim: the TV client calls webOS.platformBack() when Back is
// pressed on Home. Map it to the native shell so the app goes to background.
(function () {
    if (window.webOS && window.webOS.platformBack) return;
    window.webOS = {
        platformBack: function () {
            if (window.IptvnatorAndroid) window.IptvnatorAndroid.exitApp();
        },
    };
})();
