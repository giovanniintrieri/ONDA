package it.onda.player;

import android.content.Context;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.ffmpeg.FFmpeg;
import kotlin.Unit;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** All network/CPU work happens on the queue's worker, never on the WebView thread. */
public final class LocalDownloadBackend implements DownloadBackend {
    private final Context context;
    private final DownloadMetadata.Client metadata = new DownloadMetadata.Client();
    public LocalDownloadBackend(Context context) { this.context=context.getApplicationContext(); }
    @Override public void prepare(Cancellation cancellation) throws Exception {
        cancellation.check();
        if (context.getFilesDir().getUsableSpace() < 600L*1024*1024) throw new IOException("Libera almeno 600 MB prima di scaricare");
        YoutubeDL.getInstance().init(context); cancellation.check();
        FFmpeg.getInstance().init(context); cancellation.check();
        // yt-dlp updates its own zip from the official stable channel; failure leaves the bundled engine usable.
        android.content.SharedPreferences prefs=context.getSharedPreferences("download-engine",Context.MODE_PRIVATE);
        if (System.currentTimeMillis()-prefs.getLong("checked",0)>86_400_000L) {
            try {
                execute(base(Collections.emptyList()).addOption("--update-to","stable"), cancellation, null, null, 60);
                prefs.edit().putLong("checked",System.currentTimeMillis()).apply();
            } catch (Exception e) { cancellation.check(); Diagnostics.record(context,"aggiornamento motore download",e); }
        }
    }
    private YoutubeDLRequest base(List<String> urls) {
        return new YoutubeDLRequest(urls).addOption("--ignore-config").addOption("--no-cache-dir")
            .addOption("--socket-timeout",15).addOption("--retries",2).addOption("--extractor-retries",2)
            .addOption("--no-warnings").addOption("--no-colors");
    }
    @Override public JSONArray inspect(String url, boolean playlist, Cancellation cancellation) throws Exception {
        YoutubeDLRequest request=base(Collections.singletonList(DownloadRules.url(url,playlist)))
            .addOption("--flat-playlist").addOption("--dump-single-json").addOption("--skip-download");
        if(playlist) request.addOption("--yes-playlist").addOption("--playlist-end",DownloadRules.MAX_TRACKS+1);
        else request.addOption("--no-playlist");
        JSONObject result=json(execute(request,cancellation,null,null,180));
        JSONArray entries=result.optJSONArray("entries");
        if(entries==null) entries=new JSONArray().put(result);
        if(entries.length()>DownloadRules.MAX_TRACKS) throw new IOException("La playlist supera il limite di 500 brani");
        JSONArray queue=new JSONArray(); Set<String> seen=new HashSet<>();
        for(int i=0;i<entries.length();i++) {
            JSONObject entry=entries.optJSONObject(i); if(entry==null) continue;
            String id=entry.optString("id");
            try{DownloadRules.video(id);}catch(IllegalArgumentException e){continue;}
            if(seen.add(id)) queue.put(new JSONObject().put("id",id).put("title",DownloadRules.text(entry.optString("title","Brano"))).put("status","pending"));
        }
        if(queue.length()==0) throw new IOException("Nessun video accessibile nel link indicato");
        return queue;
    }
    @Override public Result download(JSONObject entry, File directory, String key, Cancellation cancellation, Progress progress) throws Exception {
        String url=DownloadRules.video(entry.getString("id"));
        progress.update("metadata",-1);
        JSONObject info=json(execute(base(Collections.singletonList(url)).addOption("--no-playlist").addOption("--skip-download").addOption("--dump-single-json"),cancellation,null,null,120));
        double duration=info.optDouble("duration",0);
        if(info.optBoolean("is_live") || duration<=0 || !Double.isFinite(duration) || duration>DownloadRules.MAX_SECONDS)
            throw new IOException("Sono ammessi brani con durata nota fino a 60 minuti, esclusi i live in corso");
        DownloadMetadata.Resolved resolved=metadata.enrich(info,key,cancellation); cancellation.check();
        progress.update("downloading",0);
        YoutubeDLRequest request=base(Collections.singletonList(url)).addOption("--no-playlist")
            .addOption("--format","bestaudio[protocol=https]/best[protocol=https]")
            .addOption("--max-filesize",Long.toString(DownloadRules.MAX_BYTES)).addOption("--fixup","never")
            .addOption("--no-mtime").addOption("--newline").addOption("--progress-delta",1)
            .addOption("--output",new File(directory,"raw.%(ext)s").getAbsolutePath());
        execute(request,cancellation,directory,progress,1200);
        cancellation.check();
        File[] sources=directory.listFiles((dir,name)->name.startsWith("raw.")&&!name.endsWith(".part")&&!name.endsWith(".ytdl"));
        if(sources==null||sources.length!=1||sources[0].length()==0||sources[0].length()>DownloadRules.MAX_BYTES)
            throw new IOException("Audio non disponibile o superiore a 200 MB");
        progress.update("converting",0);
        File output=new File(directory,"converted.mp3");
        encode(sources[0],output,resolved.tags,duration,cancellation,progress);
        cancellation.check();
        if(output.length()==0||output.length()>DownloadRules.MAX_BYTES) throw new IOException("Conversione MP3 non riuscita");
        return new Result(output,resolved.tags,resolved.note);
    }
    private String execute(YoutubeDLRequest request, Cancellation cancellation, File directory, Progress progress, int seconds) throws Exception {
        cancellation.check();
        String processId=UUID.randomUUID().toString();
        AtomicReference<String> failure=new AtomicReference<>();
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds);
        ScheduledExecutorService monitor=Executors.newSingleThreadScheduledExecutor();
        monitor.scheduleWithFixedDelay(()->{
            if(cancellation.cancelled()) failure.compareAndSet(null,"Download annullato");
            else if(System.nanoTime()>deadline) failure.compareAndSet(null,"Tempo esaurito. Controlla la connessione e riprova");
            else if(directory!=null) {
                if(directory.getUsableSpace()<100L*1024*1024) failure.compareAndSet(null,"Spazio sul telefono insufficiente");
                File[] files=directory.listFiles();
                if(files!=null) for(File file:files) if(file.length()>DownloadRules.MAX_BYTES) failure.compareAndSet(null,"Il brano supera 200 MB");
            }
            if(failure.get()!=null) YoutubeDL.getInstance().destroyProcessById(processId);
        },0,500,TimeUnit.MILLISECONDS);
        try {
            String out=YoutubeDL.getInstance().execute(request,processId,(percent,elapsed,line)->{
                if(progress!=null) progress.update("downloading",Math.max(0,Math.min(100,percent.intValue())));
                return Unit.INSTANCE;
            }).getOut();
            cancellation.check();
            if(failure.get()!=null) throw new IOException(failure.get());
            return out;
        } catch(Exception e) {
            if(failure.get()!=null) throw new IOException(failure.get());
            cancellation.check();
            // Never return upstream stderr: it may contain signed media URLs or authentication data.
            throw new IOException("YouTube non ha reso disponibile il brano. Controlla il link e la connessione, poi riprova",e);
        } finally { monitor.shutdownNow(); }
    }
    private static JSONObject json(String value) throws Exception {
        if(value.length()>4*1024*1024) throw new IOException("Risposta YouTube troppo grande");
        return new JSONObject(value);
    }
    private void encode(File input, File output, JSONObject tags, double duration, Cancellation cancellation, Progress progress) throws Exception {
        List<String> args=new ArrayList<>(Arrays.asList(new File(context.getApplicationInfo().nativeLibraryDir,"libffmpeg.so").getAbsolutePath(),
            "-nostdin","-hide_banner","-loglevel","error","-y","-i",input.getAbsolutePath(),"-map","0:a:0","-vn","-map_metadata","-1","-map_chapters","-1",
            "-c:a","libmp3lame","-b:a","192k","-id3v2_version","3","-write_id3v1","0"));
        for(String field:Arrays.asList("title","artist","album","genre")) {args.add("-metadata");args.add(field+"="+tags.optString(field));}
        args.addAll(Arrays.asList("-progress","pipe:1",output.getAbsolutePath()));
        ProcessBuilder builder=new ProcessBuilder(args).redirectErrorStream(true);
        builder.environment().put("LD_LIBRARY_PATH",new File(context.getNoBackupFilesDir(),"youtubedl-android/packages/ffmpeg/usr/lib").getAbsolutePath());
        builder.environment().put("TMPDIR",context.getCacheDir().getAbsolutePath());
        Process process=builder.start();
        ScheduledExecutorService monitor=Executors.newSingleThreadScheduledExecutor();
        AtomicReference<String> failure=new AtomicReference<>();
        long deadline=System.nanoTime()+TimeUnit.MINUTES.toNanos(20);
        monitor.scheduleWithFixedDelay(()->{
            if(cancellation.cancelled()) failure.compareAndSet(null,"Download annullato");
            else if(System.nanoTime()>deadline) failure.compareAndSet(null,"Conversione troppo lunga. Riprova");
            else if(output.length()>DownloadRules.MAX_BYTES||output.getParentFile().getUsableSpace()<100L*1024*1024) failure.compareAndSet(null,"Spazio sul telefono insufficiente");
            if(failure.get()!=null) process.destroyForcibly();
        },0,500,TimeUnit.MILLISECONDS);
        try(BufferedReader reader=new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while((line=reader.readLine())!=null) if(line.startsWith("out_time_us=")) {
                try {progress.update("converting",Math.min(100,(int)(Long.parseLong(line.substring(12))/10000.0/duration)));}catch(NumberFormatException ignored){}
            }
            int exit=process.waitFor(); cancellation.check();
            if(failure.get()!=null) throw new IOException(failure.get());
            if(exit!=0) throw new IOException("Conversione MP3 non riuscita");
        } finally { monitor.shutdownNow(); if(process.isAlive()) process.destroyForcibly(); }
    }
}
