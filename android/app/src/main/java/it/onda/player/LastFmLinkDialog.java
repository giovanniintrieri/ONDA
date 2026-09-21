package it.onda.player;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.*;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import org.json.*;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** User-visible Last.fm page, isolated from Onda's local WebView and its native bridge. */
final class LastFmLinkDialog extends Dialog {
    interface Listener { void complete(JSONObject result); }
    private final String trackUrl;
    private final Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView page;
    private TextView status;
    private boolean completed, reading;

    LastFmLinkDialog(Activity activity, String trackUrl, Listener listener) {
        super(activity, R.style.AppTheme);
        this.trackUrl = trackUrl; this.listener = listener;
        setOnDismissListener(dialog -> {
            if (!completed) complete("cancelled", "", "Lettura annullata. Puoi riaprire la pagina Last.fm.");
            handler.removeCallbacksAndMessages(null);
            if (page != null) {
                page.stopLoading(); page.setWebViewClient(new WebViewClient());
                if (page.getParent() instanceof ViewGroup) ((ViewGroup)page.getParent()).removeView(page);
                page.destroy(); page = null;
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled") @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout root = new LinearLayout(getContext()); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(20,22,21));
        int padding = (int)(16 * getContext().getResources().getDisplayMetrics().density);
        LinearLayout bar = new LinearLayout(getContext()); bar.setPadding(padding,0,padding,0);
        TextView heading = new TextView(getContext()); heading.setText("Last.fm · collegamento del brano"); heading.setTextSize(16); heading.setTextColor(Color.WHITE);
        bar.addView(heading,new LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1));
        Button close = new Button(getContext()); close.setText("Chiudi"); close.setAllCaps(false); close.setOnClickListener(v -> dismiss()); bar.addView(close);
        root.addView(bar);
        status = new TextView(getContext()); status.setTextColor(Color.rgb(220,227,208)); status.setPadding(padding,8,padding,12);
        status.setText("Caricamento della pagina. Se Last.fm chiede una verifica, completala qui. Poi tocca Recupera collegamento o il video del brano."); root.addView(status);
        page = new WebView(getContext()); page.setBackgroundColor(Color.rgb(20,22,21));
        page.getSettings().setJavaScriptEnabled(true); page.getSettings().setDomStorageEnabled(true);
        page.getSettings().setAllowFileAccess(false); page.getSettings().setAllowContentAccess(false);
        page.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        page.getSettings().setMediaPlaybackRequiresUserGesture(true);
        // This WebView never receives OndaAndroid, API keys, library paths or application data.
        page.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!request.isForMainFrame()) return !("https".equals(request.getUrl().getScheme()) || "about".equals(request.getUrl().getScheme()));
                if (LastFmPage.browserPage(trackUrl,url)) return false;
                String video = LastFmPage.youtube(url);
                if (request.hasGesture() && !video.isEmpty() && LastFmPage.browserPage(trackUrl,view.getUrl())) {
                    complete("found",video,"Collegamento YouTube recuperato dalla pagina aperta in Onda."); dismiss();
                } else status.setText("Resta sulla pagina del brano e tocca il suo video oppure Recupera collegamento.");
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && !LastFmPage.browserPage(trackUrl,request.getUrl().toString()))
                    return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
                if (!LastFmPage.browserPage(trackUrl,url)) view.stopLoading();
            }
            @Override public void onPageFinished(WebView view, String url) { if (LastFmPage.browserPage(trackUrl,url)) readPage(); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) { status.setText("La pagina non si è caricata. Chiudi e riprova quando la connessione è disponibile."); Diagnostics.record(getContext(),"pagina Last.fm","LASTFM_BROWSER_NETWORK_"+error.getErrorCode()); }
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                complete("error","","La pagina Last.fm si è chiusa. Puoi riprovare."); dismiss(); return true;
            }
        });
        root.addView(page,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));
        Button read = new Button(getContext()); read.setText("Recupera collegamento"); read.setAllCaps(false); read.setOnClickListener(v -> readPage()); root.addView(read);
        setContentView(root);
        if (getWindow() != null) { WindowCompat.setDecorFitsSystemWindows(getWindow(),false); getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT); }
        ViewCompat.setOnApplyWindowInsetsListener(root,(view,insets) -> {
            androidx.core.graphics.Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(safe.left,safe.top,safe.right,safe.bottom); return insets;
        });
        ViewCompat.requestApplyInsets(root);
        handler.postDelayed(() -> { if (!completed) { complete("timeout","","La lettura è scaduta. Puoi riaprire la pagina Last.fm."); dismiss(); } },120_000);
        page.loadUrl(trackUrl);
    }

    private void readPage() {
        if (page == null || completed || reading || !LastFmPage.browserPage(trackUrl,page.getUrl())) return;
        reading = true;
        // Read only bounded page markup. No injected click, form submission or CAPTCHA handling.
        String script = "(()=>{let out='';const h=document.querySelector('h1');if(h)out+='<h1></h1>';"
            + "const selectors='title,link[rel=canonical],script[src*=\"/_fs-ch-\"],link[href*=\"/_fs-ch-\"],.header-new-playlink,[data-track-url][data-youtube-url]';"
            + "for(const e of Array.from(document.querySelectorAll(selectors)).slice(0,60)){out+=e.outerHTML;if(out.length>131072)break;}"
            + "if(document.querySelector('#challenge-form,#cf-challenge-running'))out+='<div id=\"challenge-form\"></div>';return out.slice(0,131072);})()";
        page.evaluateJavascript(script,value -> {
            reading = false;
            if (page == null || completed || !LastFmPage.browserPage(trackUrl,page.getUrl())) return;
            try {
                Object decoded = new JSONTokener(value).nextValue();
                if (!(decoded instanceof String)) return;
                JSONObject result = LastFmPage.inspect((String)decoded,trackUrl);
                if (!result.optString("url").isEmpty()) { complete("found",result.getString("url"),"Collegamento YouTube recuperato dalla pagina aperta in Onda."); dismiss(); }
                else {
                    boolean verification = "verification".equals(result.optString("status"));
                    status.setText(verification ? "Last.fm sta chiedendo una verifica. Completala nella pagina, poi tocca Recupera collegamento." : "Tocca il video principale del brano oppure Recupera collegamento quando la pagina ha finito di caricarsi.");
                    Diagnostics.record(getContext(),"pagina Last.fm","LASTFM_BROWSER_"+result.optString("status").toUpperCase(java.util.Locale.ROOT));
                }
            } catch (Exception e) { status.setText("Collegamento non ancora letto. Tocca il video del brano oppure riprova."); }
        });
    }

    private void complete(String state, String url, String message) {
        if (completed) return;
        completed = true;
        try { listener.complete(LastFmPage.result(state,url,message)); }
        catch (Exception ignored) { /* Closing the browser must not affect playback. */ }
    }
}
