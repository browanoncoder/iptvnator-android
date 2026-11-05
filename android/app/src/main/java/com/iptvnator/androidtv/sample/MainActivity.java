package com.iptvnator.androidtv.sample;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Routes the remote's Back key into the TV client's own Back handling
     * (it listens for {@code key === 'BrowserBack'}), so Back closes the player
     * or pops a screen instead of finishing the activity.
     */
    private static final String DISPATCH_BACK_JS =
        "(function(){var t=document.activeElement||document;"
            + "t.dispatchEvent(new KeyboardEvent('keydown',"
            + "{key:'BrowserBack',bubbles:true,cancelable:true}));})();";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final WebView webView = getBridge().getWebView();
        configureWebView(webView);
        webView.addJavascriptInterface(new AndroidShell(), "IptvnatorAndroid");
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        webView.evaluateJavascript(DISPATCH_BACK_JS, null);
                    }
                }
            );
    }

    private static void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        // The TV client is laid out for a 1920x1080 CSS viewport (LG webOS).
        // Honour the page's fixed-width viewport meta and fit it to the screen.
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        // Allow playback to start from a remote key press without a touch gesture.
        settings.setMediaPlaybackRequiresUserGesture(false);
    }

    /** Native hooks exposed to the page as {@code window.IptvnatorAndroid}. */
    private final class AndroidShell {

        /** Called by the platformBack() shim when Back is pressed on Home. */
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> moveTaskToBack(true));
        }
    }
}
