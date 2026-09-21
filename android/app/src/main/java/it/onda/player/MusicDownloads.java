package it.onda.player;

import android.content.*;
import androidx.core.content.ContextCompat;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;

/** One persistent queue per application; completed entries survive cancellation and process death. */
public final class MusicDownloads {
    private static MusicDownloads instance;
    public static synchronized MusicDownloads get(Context context) {
        if(instance==null) instance=new MusicDownloads(context.getApplicationContext());
        return instance;
    }
    private final Context context;
    private final SharedPreferences preferences;
    private JSONObject state;
    private DownloadBackend.Cancellation cancellation;
    private boolean running;
    private volatile long libraryRevision;
    private MusicDownloads(Context context) {
        this.context=context;preferences=context.getSharedPreferences("music-downloads",Context.MODE_PRIVATE);
        try {state=new JSONObject(preferences.getString("queue","{}"));}catch(Exception e){state=new JSONObject();}
        if(state.optBoolean("busy")) {
            put(state,"busy",false);put(state,"stage","interrupted");put(state,"message","Download interrotto. Puoi riprendere i brani rimasti.");
            JSONArray entries=state.optJSONArray("entries");
            if(entries!=null)for(int i=0;i<entries.length();i++){JSONObject entry=entries.optJSONObject(i);if(entry!=null&&"working".equals(entry.optString("status")))put(entry,"status","pending");}
            persist();
        }
    }
    private static void put(JSONObject object,String key,Object value) {try{object.put(key,value);}catch(JSONException e){throw new IllegalStateException(e);}}
    public long libraryRevision() {return libraryRevision;}
    synchronized String lastFmKey() {return preferences.getString("lastFmKey","");}
    public synchronized JSONObject snapshot() {
        try {
            JSONObject copy=new JSONObject(state.toString());
            int added=0,duplicates=0,failed=0,remaining=0;
            JSONArray entries=copy.optJSONArray("entries");
            if(entries!=null)for(int i=0;i<entries.length();i++) {
                String status=entries.getJSONObject(i).optString("status");
                if(status.equals("added"))added++;else if(status.equals("duplicate"))duplicates++;else {remaining++;if(status.equals("failed"))failed++;}
            }
            return copy.put("added",added).put("duplicates",duplicates).put("failed",failed).put("remaining",remaining)
                .put("canResume",!copy.optBoolean("busy")&&!copy.optString("url").isEmpty()&&(entries==null||remaining>0))
                .put("lastFmConfigured",!preferences.getString("lastFmKey","").isEmpty());
        }catch(Exception e){throw new IllegalStateException(e);}
    }
    public synchronized JSONObject configure(String key, boolean clear) {
        if(state.optBoolean("busy"))throw new IllegalStateException("Attendi la fine della coda per modificare Last.fm");
        key=key.trim();
        if(clear)preferences.edit().remove("lastFmKey").apply();
        else if(!key.isEmpty()) {
            if(!key.matches("[A-Za-z0-9]{32}"))throw new IllegalArgumentException("La chiave Last.fm deve contenere 32 caratteri alfanumerici");
            preferences.edit().putString("lastFmKey",key).apply();
        }
        return snapshot();
    }
    public synchronized JSONObject startFromSearch(String url,boolean replaceInterrupted) throws Exception {
        if(snapshot().optBoolean("canResume")&&!replaceInterrupted)throw new IllegalStateException("Hai una coda interrotta. Conferma la sostituzione oppure riprendila in Scarica musica.");
        return start(url,false,false);
    }
    public synchronized JSONObject start(String url,boolean playlist,boolean resume) throws Exception {
        if(state.optBoolean("busy")||running)throw new IllegalStateException("Una coda è già in corso");
        if(resume) {
            if(!snapshot().optBoolean("canResume"))throw new IllegalStateException("Non ci sono download da riprendere");
        }else state=new JSONObject().put("url",DownloadRules.url(url,playlist)).put("playlist",playlist);
        cancellation=new DownloadBackend.Cancellation();
        put(state,"busy",true);put(state,"stage","preparing");put(state,"message","");put(state,"percent",-1);
        persist();
        try{ContextCompat.startForegroundService(context,new Intent(context,DownloadService.class));}
        catch(Exception e){put(state,"busy",false);put(state,"stage","interrupted");put(state,"message","Apri Onda e riprova ad avviare il download");persist();throw new IOException(state.optString("message"));}
        return snapshot();
    }
    synchronized void failToStart() {
        if(running){cancel();return;}
        put(state,"busy",false);put(state,"stage","interrupted");put(state,"message","Il download non è partito. Riapri Onda e riprova.");persist();
    }
    public synchronized void cancel() {
        if(cancellation!=null&&state.optBoolean("busy")) {cancellation.cancel();put(state,"stage","cancelling");put(state,"message","Annullamento in corso…");persist();}
    }
    /** Returns false when an already running service received another start. */
    synchronized boolean run(Runnable finished) {
        if(running)return false;
        if(!state.optBoolean("busy")||cancellation==null)return false;
        running=true;
        ExecutorService worker=Executors.newSingleThreadExecutor();
        worker.execute(()->{try{work();}finally{synchronized(this){running=false;}finished.run();}});
        worker.shutdown();return true;
    }
    synchronized boolean busy() {return state.optBoolean("busy");}
    private synchronized void stage(String stage,int percent) {
        if(cancellation.cancelled())return;
        put(state,"stage",stage);put(state,"percent",percent);
    }
    private synchronized void entry(JSONObject entry,String status,String note) {
        put(entry,"status",status);put(entry,"note",note);persist();
    }
    private void work() {
        File workspace=new File(context.getCacheDir(),"music-downloads");
        DownloadBackend backend=new LocalDownloadBackend(context);
        try {
            delete(workspace);if(!workspace.mkdirs()&&!workspace.isDirectory())throw new IOException("Memoria temporanea non disponibile");
            backend.prepare(cancellation);
            JSONArray entries;
            synchronized(this){entries=state.optJSONArray("entries");}
            if(entries==null) {
                stage("listing",-1);
                entries=backend.inspect(state.optString("url"),state.optBoolean("playlist"),cancellation);
                synchronized(this){put(state,"entries",entries);persist();}
            }
            LibraryStore store=LibraryStore.get(context);
            AudioImporter importer=new AudioImporter(context);
            String key=preferences.getString("lastFmKey","");
            for(int i=0;i<entries.length();i++) {
                cancellation.check();
                JSONObject item=entries.getJSONObject(i);
                if(DownloadRules.complete(item.optString("status")))continue;
                synchronized(this){put(state,"current",i);put(state,"percent",-1);}
                JSONObject previous=store.read("downloadSources",item.getString("id"));
                if(previous!=null&&store.read("tracks",previous.optString("trackId"))!=null){entry(item,"duplicate","Già presente in libreria");continue;}
                File directory=new File(workspace,"track");delete(directory);
                if(!directory.mkdirs())throw new IOException("Memoria temporanea non disponibile");
                entry(item,"working","");
                try {
                    DownloadBackend.Result result=backend.download(item,directory,key,cancellation,this::stage);
                    cancellation.check();stage("importing",-1);
                    JSONObject imported=importer.importDownload(result.file,DownloadRules.filename(result.metadata.getString("title")),result.metadata);
                    if(imported!=null) {
                        store.put("downloadSources",item.getString("id"),new JSONObject().put("trackId",imported.getString("id")));
                        libraryRevision++;
                    }
                    synchronized(this){put(item,"title",result.metadata.getString("title"));}
                    entry(item,imported==null?"duplicate":"added",result.note);
                }catch(Exception e) {
                    if(cancellation.cancelled()){entry(item,"pending","");throw e;}
                    Diagnostics.record(context,"download brano",e);
                    entry(item,"failed",e instanceof IOException?e.getMessage():"Brano non disponibile. Puoi riprovare.");
                    if(e instanceof FfmpegRuntime.Failure&&((FfmpegRuntime.Failure)e).engineFailure)throw e;
                }finally{delete(directory);}
            }
            synchronized(this){put(state,"stage",cancellation.cancelled()?"cancelled":"done");put(state,"message",cancellation.cancelled()?"Download annullato. I brani già aggiunti restano in libreria.":"Coda terminata");}
        }catch(Exception e) {
            Diagnostics.record(context,"coda download",e);
            synchronized(this){put(state,"stage",cancellation.cancelled()?"cancelled":"error");put(state,"message",cancellation.cancelled()?"Download annullato. Puoi riprendere i brani rimasti.":e instanceof IOException?e.getMessage():"Impossibile avviare il download. Controlla il link e la connessione.");}
        }finally {
            delete(workspace);
            synchronized(this){put(state,"busy",false);put(state,"percent",-1);persist();}
        }
    }
    private void persist() {preferences.edit().putString("queue",state.toString()).apply();}
    private static void delete(File file) {File[] children=file.listFiles();if(children!=null)for(File child:children)delete(child);file.delete();}
}
