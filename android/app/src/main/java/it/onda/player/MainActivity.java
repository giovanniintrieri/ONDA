package it.onda.player;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.*;
import android.provider.OpenableColumns;
import android.webkit.*;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.documentfile.provider.DocumentFile;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import androidx.webkit.WebViewAssetLoader;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

@UnstableApi
public final class MainActivity extends ComponentActivity {
    private WebView web;
    private ListenableFuture<MediaController> controllerFuture;
    private MediaController controller;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final List<Runnable> awaitingController=new ArrayList<>();
    private AudioImporter importer;
    private LibraryStore store;
    private AppUpdates updates;
    private final AppUpdates.Listener updateListener = state -> event("appUpdate", state);
    private boolean pageReady=false,visible=false;
    private long pickerCall=-1;
    private final Runnable progress=new Runnable(){@Override public void run(){
        if(!visible)return;
        try{if(controller!=null)event("progress",new JSONObject().put("position",Math.max(0,controller.getCurrentPosition())/1000.0));}catch(Exception ignored){}
        handler.postDelayed(this,500);
    }};
    private final ActivityResultLauncher<Intent> picker=registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),result->{
        long id=pickerCall;pickerCall=-1;
        if(id<0)return;
        Intent data=result.getData();
        if(result.getResultCode()!=RESULT_OK||data==null){reply(id,new JSONObject(),null);return;}
        List<Uri> uris=new ArrayList<>();
        if(data.getClipData()!=null){for(int i=0;i<data.getClipData().getItemCount();i++)uris.add(data.getClipData().getItemAt(i).getUri());}
        else if(data.getData()!=null)uris.add(data.getData());
        boolean tree=data.getData()!=null&&android.provider.DocumentsContract.isTreeUri(data.getData());
        io.execute(()->importSelection(id,uris,tree));
    });

    @SuppressLint("SetJavaScriptEnabled") @Override public void onCreate(Bundle saved){
        super.onCreate(saved);store=LibraryStore.get(this);importer=new AudioImporter(this);
        updates=AppUpdates.get(this);
        WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        web=new WebView(this);web.setBackgroundColor(android.graphics.Color.rgb(20,22,21));setContentView(web);
        ViewCompat.setOnApplyWindowInsetsListener(web,(view,insets)->{
            androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
        });
        web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        File covers=new File(getFilesDir(),"covers");covers.mkdirs();
        WebViewAssetLoader loader=new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/covers/",new WebViewAssetLoader.InternalStoragePathHandler(this,covers)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                WebResourceResponse local=loader.shouldInterceptRequest(request.getUrl());
                return local!=null?local:new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !isLocal(request.getUrl());}
            @Override public void onPageFinished(WebView view,String url){pageReady=isLocal(Uri.parse(url));sendState();}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result){
                new AlertDialog.Builder(MainActivity.this).setTitle("Onda").setMessage(message).setPositiveButton("OK",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;
            }
        });
        web.addJavascriptInterface(new Bridge(),"OndaAndroid");
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){@Override public void handleOnBackPressed(){
            web.evaluateJavascript("Boolean(document.querySelector('[role=dialog]'))",value->{
                if("true".equals(value))web.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}))",null);
                else moveTaskToBack(true);
            });
        }});
        controllerFuture=new MediaController.Builder(this,new SessionToken(this,new ComponentName(this,PlaybackService.class))).buildAsync();
        controllerFuture.addListener(()->{
            try{controller=controllerFuture.get();controller.addListener(new Player.Listener(){@Override public void onEvents(Player player,Player.Events events){sendState();}});
                List<Runnable> calls=new ArrayList<>(awaitingController);awaitingController.clear();calls.forEach(Runnable::run);sendState();
            }catch(Exception e){android.util.Log.e("Onda","Collegamento al servizio audio non riuscito",e);}
        },ContextCompat.getMainExecutor(this));
        web.loadUrl("https://appassets.androidplatform.net/assets/ui/index.html");
    }
    private boolean isLocal(Uri uri){return "https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost());}
    private PlaybackService service(){PlaybackService s=PlaybackService.instance;if(s==null)throw new IllegalStateException("Servizio audio non pronto");return s;}
    private void sendState(){if(controller==null||!pageReady)return;try{event("player",service().snapshot());}catch(Exception e){android.util.Log.w("Onda","Stato audio non disponibile",e);}}
    private void deliver(JSONObject value){handler.post(()->{if(!isDestroyed()&&pageReady)web.evaluateJavascript("window.__ondaReply&&window.__ondaReply("+value.toString()+")",null);});}
    private void event(String name,Object data){try{deliver(new JSONObject().put("event",name).put("data",data));}catch(JSONException ignored){}}
    private void reply(long id,Object result,Exception error){try{JSONObject value=new JSONObject().put("id",id);if(error!=null)value.put("error",error.getMessage()==null?"Operazione non riuscita":error.getMessage());else value.put("result",result==null?JSONObject.NULL:result);deliver(value);}catch(JSONException ignored){}}
    private final class Bridge {
        @JavascriptInterface public void postMessage(String raw){
            if(raw==null||raw.length()>210_000)return;
            try{JSONObject message=new JSONObject(raw);long id=message.getLong("id");String method=message.getString("method");JSONObject params=message.optJSONObject("params");
                handler.post(()->{pageReady=true;dispatch(id,method,params==null?new JSONObject():params);});
            }catch(Exception e){android.util.Log.w("Onda","Richiesta non valida",e);}
        }
    }
    private void dispatch(long id,String method,JSONObject p){
        if(isDestroyed())return;
        if(Arrays.asList("state","setQueue","select","play","pause","next","previous","seek","repeat","shuffle","volume","enqueue","removeTrack","editTrack").contains(method)&&controller==null){awaitingController.add(()->dispatch(id,method,p));return;}
        try{
            if("updateState".equals(method)){reply(id,updates.snapshot(),null);return;}
            if("checkUpdate".equals(method)){updates.check(true);reply(id,updates.snapshot(),null);return;}
            if("downloadUpdate".equals(method)){updates.download();reply(id,updates.snapshot(),null);return;}
            if("cancelUpdate".equals(method)){updates.cancel();reply(id,updates.snapshot(),null);return;}
            if("installUpdate".equals(method)){updates.install(this);reply(id,updates.snapshot(),null);return;}
            if("pickTracks".equals(method)){
                if(pickerCall>=0)throw new IllegalStateException("Una selezione di file è già aperta");
                Intent intent=new Intent(p.optBoolean("folder")?Intent.ACTION_OPEN_DOCUMENT_TREE:Intent.ACTION_OPEN_DOCUMENT);
                if(!p.optBoolean("folder")){intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);}
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);pickerCall=id;picker.launch(intent);return;
            }
            if(Arrays.asList("state","setQueue","select","play","pause","next","previous","seek","repeat","shuffle","volume","enqueue").contains(method)){
                reply(id,service().command(method,p),null);return;
            }
            if("removeTrack".equals(method)){service().remove(p.getString("id"));sendState();}
            io.execute(()->{
                try{
                    Object result=dataCommand(method,p);
                    handler.post(()->{
                        try{if("editTrack".equals(method))service().refreshMetadata(p.getString("id"));reply(id,result,null);}
                        catch(Exception e){reply(id,null,e);}
                    });
                }catch(Exception e){reply(id,null,e);}
            });
        }catch(Exception e){if("pickTracks".equals(method))pickerCall=-1;reply(id,null,e);}
    }
    private Object dataCommand(String method,JSONObject p) throws Exception {
        switch(method){
            case "library":return store.library();
            case "track":return store.requireTrack(p.getString("id"));
            case "editTrack":return store.editTrack(p);
            case "removeTrack":store.removeTrack(this,p.getString("id"));return null;
            case "savePlaylist":JSONObject playlist=p.getJSONObject("playlist");if(playlist.getString("name").trim().isEmpty())throw new IllegalArgumentException("Nome playlist obbligatorio");playlist.getJSONArray("trackIds");store.put("playlists",playlist.getString("id"),playlist);return null;
            case "removePlaylist":store.delete("playlists",p.getString("id"));return null;
            case "loadSetting":return store.setting(p.getString("id"));
            case "saveSetting":if("player".equals(p.getString("id")))throw new IllegalArgumentException("Impostazione riservata");store.setting(p.getString("id"),p.get("value"));return null;
            case "beginImport":return new JSONObject().put("token",importer.begin(p.getString("filename")));
            case "appendImport":importer.append(p.getString("token"),p.getString("data"));return null;
            case "finishImport":return importer.finish(p.getString("token"),p.optJSONObject("overrides")==null?new JSONObject():p.getJSONObject("overrides"));
            case "cancelImport":importer.cancel(p.getString("token"));return null;
            default:throw new IllegalArgumentException("Operazione non riconosciuta");
        }
    }
    private String nameOf(Uri uri){
        try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())return c.getString(0);}catch(Exception ignored){}
        return "Brano";
    }
    private void collect(DocumentFile root,List<DocumentFile> files,Set<String> visited){
        if(root==null||!visited.add(root.getUri().toString()))return;
        ArrayDeque<DocumentFile> dirs=new ArrayDeque<>();dirs.add(root);
        while(!dirs.isEmpty()){DocumentFile dir=dirs.removeFirst();for(DocumentFile child:dir.listFiles()){
            if(child.isDirectory()){if(visited.add(child.getUri().toString()))dirs.add(child);}
            else if(child.isFile()&&AudioImporter.isAudio(child.getName()==null?"":child.getName(),child.getType()))files.add(child);
        }}
    }
    private void importSelection(long call,List<Uri> selection,boolean tree){
        int added=0,duplicates=0,failed=0;String firstError="";
        try{
            List<Uri> uris=new ArrayList<>();List<String> names=new ArrayList<>();
            if(tree){List<DocumentFile> files=new ArrayList<>();collect(DocumentFile.fromTreeUri(this,selection.get(0)),files,new HashSet<>());for(DocumentFile f:files){uris.add(f.getUri());names.add(f.getName());}}
            else for(Uri uri:selection){String name=nameOf(uri);if(AudioImporter.isAudio(name,getContentResolver().getType(uri))){uris.add(uri);names.add(name);}}
            for(int i=0;i<uris.size();i++){
                try{if(importer.importUri(uris.get(i),names.get(i))==null)duplicates++;else added++;}
                catch(Exception e){failed++;if(firstError.isEmpty())firstError=names.get(i)+": "+e.getMessage();}
                event("importProgress",new JSONObject().put("done",i+1).put("total",uris.size()));
            }
            reply(call,new JSONObject().put("added",added).put("duplicates",duplicates).put("failed",failed).put("error",firstError),null);
            event("libraryChanged",new JSONObject());
        }catch(Exception e){reply(call,null,e);}
    }
    @Override protected void onResume(){super.onResume();visible=true;if(web!=null)web.onResume();handler.removeCallbacks(progress);handler.post(progress);sendState();
        if(updates!=null){updates.observe(updateListener);updates.check(false);}}
    @Override protected void onPause(){visible=false;handler.removeCallbacks(progress);if(updates!=null)updates.remove(updateListener);if(web!=null)web.onPause();super.onPause();}
    @Override protected void onDestroy(){visible=false;handler.removeCallbacksAndMessages(null);awaitingController.clear();
        if(updates!=null)updates.remove(updateListener);
        if(controllerFuture!=null)MediaController.releaseFuture(controllerFuture);
        if(web!=null){web.removeJavascriptInterface("OndaAndroid");web.destroy();}
        io.execute(()->importer.close());io.shutdown();super.onDestroy();
    }
}
