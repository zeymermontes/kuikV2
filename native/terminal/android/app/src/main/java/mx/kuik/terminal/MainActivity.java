package mx.kuik.terminal;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // A register or kitchen screen never sleeps.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    /**
     * The hardware back button walks the WebView's history; at the root it
     * opens the mode chooser instead of closing the app, which on a shared
     * tablet would just confuse whoever picks it up next.
     */
    @Override
    public void onBackPressed() {
        WebView webView = getBridge().getWebView();
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        String url = webView.getUrl();
        if (url != null && !url.contains("/terminal")) {
            webView.loadUrl(getBridge().getServerUrl() + "?pick=1");
            return;
        }
        super.onBackPressed();
    }
}
