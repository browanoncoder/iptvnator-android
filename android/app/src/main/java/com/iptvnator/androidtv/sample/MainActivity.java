package com.iptvnator.androidtv.sample;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.core.util.Consumer;
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter;
import androidx.window.layout.DisplayFeature;
import androidx.window.layout.FoldingFeature;
import androidx.window.layout.WindowInfoTracker;
import androidx.window.layout.WindowLayoutInfo;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import android.graphics.Bitmap;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    private WindowInfoTrackerCallbackAdapter windowInfo;
    private final Consumer<WindowLayoutInfo> postureListener = this::reportPosture;

    /**
     * Routes the remote's Back key into the TV client's own Back handling
     * (it listens for {@code key === 'BrowserBack'}), so Back closes the player
     * or pops a screen instead of finishing the activity.
     */
    private static String dispatchKeyJs(String key) {
        return "(function(){var t=document.activeElement||document;"
            + "t.dispatchEvent(new KeyboardEvent('keydown',"
            + "{key:'" + key + "',bubbles:true,cancelable:true}));})();";
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final WebView webView = getBridge().getWebView();
        configureWebView(webView);
        // WebView's default poster is a grey ▶ circle that gets stretched across
        // the player before the first frame (and stays when a stream fails).
        // Keep Capacitor's chrome client and only replace the poster.
        webView.setWebChromeClient(
            new BridgeWebChromeClient(getBridge()) {
                @Override
                public Bitmap getDefaultVideoPoster() {
                    return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
                }
            }
        );
        webView.addJavascriptInterface(new AndroidShell(), "IptvnatorAndroid");
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        webView.evaluateJavascript(dispatchKeyJs("BrowserBack"), null);
                    }
                }
            );
    }

    /**
     * Android consumes Menu and Guide before the WebView sees them; forward
     * them so the page can open its quick menu and TV guide.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String key = null;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_MENU:
                key = "ContextMenu";
                break;
            case KeyEvent.KEYCODE_GUIDE:
                key = "Guide";
                break;
            default:
                break;
        }
        if (key == null) return super.dispatchKeyEvent(event);
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            getBridge().getWebView().evaluateJavascript(dispatchKeyJs(key), null);
        }
        return true;
    }

    @Override
    public void onStart() {
        super.onStart();
        windowInfo = new WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(this));
        windowInfo.addWindowLayoutInfoListener(this, ContextCompat.getMainExecutor(this), postureListener);
    }

    @Override
    public void onStop() {
        if (windowInfo != null) windowInfo.removeWindowLayoutInfoListener(postureListener);
        super.onStop();
    }

    /**
     * Tabletop: a foldable half-open with a horizontal hinge. The page gets
     * the hinge position as a fraction of the window height so the player can
     * keep the picture above the fold and the controls below it.
     */
    private void reportPosture(WindowLayoutInfo info) {
        double fold = 0;
        int height = getWindow().getDecorView().getHeight();
        for (DisplayFeature feature : info.getDisplayFeatures()) {
            if (!(feature instanceof FoldingFeature)) continue;
            FoldingFeature folding = (FoldingFeature) feature;
            boolean tabletop = folding.getState() == FoldingFeature.State.HALF_OPENED
                && folding.getOrientation() == FoldingFeature.Orientation.HORIZONTAL;
            if (tabletop && height > 0) fold = folding.getBounds().centerY() / (double) height;
        }
        String js = "window.dispatchEvent(new CustomEvent('iptvnator-posture',{detail:{fold:" + fold + "}}));";
        getBridge().getWebView().evaluateJavascript(js, null);
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

        /** True on Android TV / Google TV; the page then uses the 10-foot layout. */
        @JavascriptInterface
        public boolean isTelevision() {
            UiModeManager uiMode = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
            return uiMode != null
                && uiMode.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        }

        /**
         * Current window size in dp as "width,height". Unlike screen size this
         * follows folding, unfolding and multi-window resizes.
         */
        @JavascriptInterface
        public String windowSizeDp() {
            Configuration config = getResources().getConfiguration();
            return config.screenWidthDp + "," + config.screenHeightDp;
        }

        /**
         * Compact phones turn to landscape for fullscreen playback and return
         * to the user's orientation afterwards. TVs, tablets and unfolded
         * foldables keep the orientation the user chose.
         */
        @JavascriptInterface
        public void setPlayerLandscape(boolean on) {
            if (isTelevision()) return;
            if (getResources().getConfiguration().smallestScreenWidthDp >= 600) return;
            runOnUiThread(() -> setRequestedOrientation(
                on ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            ));
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
