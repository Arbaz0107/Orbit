"""Edge-to-edge (full screen) for CMA Orbit on Android.

- App draws behind the status bar, navigation bar and camera cut-out (notch), in portrait AND landscape.
- The bars / notch area are painted with the colour of the screen edge that is next to them, so they blend in
  with whichever theme (Soft / Neo, light / dark) or screen (e.g. the PDF viewer) is showing.
- The web page tells the native side which colours to use through the OrbitBars plugin (www/js/bars.js).
Safe to re-run; it rewrites MainActivity.java and adds OrbitBarsPlugin.java next to it."""
import pathlib, re, sys

root = pathlib.Path("android/app/src/main/java")
mains = list(root.rglob("MainActivity.java")) if root.exists() else []
if not mains:
    print("WARNING: MainActivity.java not found - skipping fullscreen patch"); sys.exit(0)
main = mains[0]
pkg = re.search(r'^package\s+([\w.]+);', main.read_text(encoding="utf-8"), re.M).group(1)

MAIN = '''package %(pkg)s;

import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private int cTop, cBottom;
    private String lastJs = "";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OrbitBarsPlugin.class);
        super.onCreate(savedInstanceState);
        setupEdgeToEdge();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                final OnBackPressedCallback self = this;
                if (getBridge() == null || getBridge().getWebView() == null) { self.setEnabled(false); getOnBackPressedDispatcher().onBackPressed(); return; }
                getBridge().getWebView().evaluateJavascript(
                    "(function(){try{return window.__orbitBack?window.__orbitBack():false}catch(e){return false}})()",
                    new android.webkit.ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String v) {
                            if (!"true".equals(v)) { self.setEnabled(false); getOnBackPressedDispatcher().onBackPressed(); }
                        }
                    });
            }
        });
    }

    private void setupEdgeToEdge() {
        final Window w = getWindow();
        WindowCompat.setDecorFitsSystemWindows(w, false);
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        if (Build.VERSION.SDK_INT >= 29) w.setNavigationBarContrastEnforced(false);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        SharedPreferences sp = getSharedPreferences("orbit_bars", MODE_PRIVATE);
        int def = 0xFF7C7BCB;   // same as the splash screen
        cTop = sp.getInt("t", def); cBottom = sp.getInt("b", def);
        final ViewGroup content = findViewById(android.R.id.content);
        content.setBackgroundColor(0xFF7C7BCB);    // splash colour: identical to the launch screen, so the notch area never changes colour
        applyAppearance();
        updateBarsForOrientation();

        // The web page fills the whole screen (behind the bars and the notch). We only tell it how big the
        // bars are (it pads its own header / nav with that), and lift it above the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean kb = ime.bottom > bars.bottom;
            final int imeLift = kb ? ime.bottom : 0;
            final float d = getResources().getDisplayMetrics().density;
            final String js = "window.__orbitInsets&&window.__orbitInsets(" + (bars.top / d) + "," + (bars.right / d) + ","
                    + (kb ? 0 : bars.bottom / d) + "," + (bars.left / d) + ")";
            lastJs = js;
            try {
                android.webkit.WebView wv = getBridge().getWebView();
                ViewGroup.LayoutParams lp = wv.getLayoutParams();
                if (lp instanceof ViewGroup.MarginLayoutParams) {
                    ViewGroup.MarginLayoutParams mp = (ViewGroup.MarginLayoutParams) lp;
                    if (mp.bottomMargin != imeLift) { mp.setMargins(0, 0, 0, imeLift); wv.setLayoutParams(mp); }
                }
                wv.evaluateJavascript(js, null);
            } catch (Exception ignored) { }
            return insets;
        });
        try { android.webkit.WebView wv0 = getBridge().getWebView(); wv0.setVerticalScrollBarEnabled(false); wv0.setHorizontalScrollBarEnabled(false); wv0.setOverScrollMode(View.OVER_SCROLL_NEVER); } catch (Exception ignored) { }
        ViewCompat.requestApplyInsets(content);
    }

    /** Landscape: hide the status bar + navigation bar for more room (swipe from the edge to peek). Portrait: show them. */
    private void updateBarsForOrientation() {
        Window w = getWindow();
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        if (c == null) return;
        boolean land = getResources().getConfiguration().orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE;
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (land) c.hide(WindowInsetsCompat.Type.systemBars()); else c.show(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        updateBarsForOrientation();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) updateBarsForOrientation();
    }

    private static boolean isLight(int c) {
        return (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255.0 > 0.55;
    }

    private void applyAppearance() {
        Window w = getWindow();
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        if (c != null) {
            c.setAppearanceLightStatusBars(isLight(cTop));
            c.setAppearanceLightNavigationBars(isLight(cBottom));
        }
    }

    private static int parse(String s, int fallback) {
        try { return Color.parseColor(s); } catch (Exception e) { return fallback; }
    }

    /** Called from the web page (OrbitBars plugin): light / dark status + navigation bar icons to suit the app. */
    public void applyBars(final String top, final String bottom, final String left, final String right) {
        runOnUiThread(() -> {
            cTop = parse(top, cTop); cBottom = parse(bottom, cBottom);
            View content = findViewById(android.R.id.content);
            getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(cBottom));
            if (content != null) content.setBackgroundColor(cBottom);   // behind the keyboard / during resize: same colour as the page's bottom edge, never splash purple
            applyAppearance();
            try { if (!lastJs.isEmpty()) getBridge().getWebView().evaluateJavascript(lastJs, null); } catch (Exception ignored) { }
            getSharedPreferences("orbit_bars", MODE_PRIVATE).edit().putInt("t", cTop).putInt("b", cBottom).apply();
        });
    }
}
''' % {"pkg": pkg}

PLUGIN = '''package %(pkg)s;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OrbitBars")
public class OrbitBarsPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        ((MainActivity) getActivity()).applyBars(call.getString("top"), call.getString("bottom"),
                call.getString("left"), call.getString("right"));
        call.resolve();
    }
}
''' % {"pkg": pkg}

main.write_text(MAIN, encoding="utf-8")
(main.parent / "OrbitBarsPlugin.java").write_text(PLUGIN, encoding="utf-8")

# let the cut-out be used from the very first frame (splash) as well
p = pathlib.Path("android/app/src/main/res/values/styles.xml")
if p.exists():
    s = p.read_text(encoding="utf-8")
    m = re.search(r'<style name="AppTheme\.NoActionBar"[^>]*>', s)
    if m and 'windowLayoutInDisplayCutoutMode' not in s:
        s = s[:m.end()] + '\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>' + s[m.end():]
        p.write_text(s, encoding="utf-8")
print("Fullscreen patch applied to", main)
