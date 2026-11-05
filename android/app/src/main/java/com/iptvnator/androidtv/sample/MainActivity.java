package com.iptvnator.androidtv.sample;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

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

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    /** A 10-foot media UI: hide status and navigation bars; swipe from an edge reveals them. */
    private void enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
        controller.hide(WindowInsetsCompat.Type.systemBars());
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

        /** Keeps the display awake only while a video is actually playing. */
        @JavascriptInterface
        public void setKeepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }
    }
}
