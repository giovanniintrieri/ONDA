package it.onda.player;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.*;

@UnstableApi
public final class PlaybackService extends MediaSessionService {
    static PlaybackService instance;
    private ExoPlayer player;
    private MediaSession session;
    private LibraryStore store;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private List<String> original=new ArrayList<>();
    private boolean shuffle=false,updating=false,counted=false;
    private int repeat=0;
    private String visitId;
    private long heardMs=0,lastClock=0,lastSaved=0,visitDuration=0;
    private final Runnable tick=new Runnable(){@Override public void run(){
        accumulate();
        if(player.isPlaying()&&SystemClock.elapsedRealtime()-lastSaved>10_000)persist();
        if(player.isPlaying())handler.postDelayed(this,1000);
    }};

    @Override public void onCreate(){
        super.onCreate();store=LibraryStore.get(this);
        player=new ExoPlayer.Builder(this)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),true)
            .setHandleAudioBecomingNoisy(true).setWakeMode(C.WAKE_MODE_LOCAL).build();
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        session=new MediaSession.Builder(this,player).setSessionActivity(open).setCallback(new MediaSession.Callback(){
            @Override public MediaSession.ConnectionResult onConnect(MediaSession session,MediaSession.ControllerInfo controller){
                if(controller.getUid()!=android.os.Process.myUid()&&!controller.isTrusted())return MediaSession.ConnectionResult.reject();
                return MediaSession.Callback.super.onConnect(session,controller);
            }
        }).build();
        player.addListener(new Player.Listener(){
            @Override public void onIsPlayingChanged(boolean playing){
                if(playing){lastClock=SystemClock.elapsedRealtime();handler.removeCallbacks(tick);handler.postDelayed(tick,1000);}
                else {accumulate();lastClock=0;handler.removeCallbacks(tick);persist();}
            }
            @Override public void onMediaItemTransition(@Nullable MediaItem item,int reason){
                if(updating)return;
                finishVisit(reason==Player.MEDIA_ITEM_TRANSITION_REASON_SEEK);
                if(shuffle&&repeat==1&&reason==Player.MEDIA_ITEM_TRANSITION_REASON_AUTO&&player.getCurrentMediaItemIndex()==0&&visitId!=null){
                    try {
                        List<String> ids=QueueOrder.nextCycle(queueIds(),visitId,new Random());
                        updating=true;player.setMediaItems(mediaItems(ids),0,0);player.prepare();
                        updating=false;item=player.getCurrentMediaItem();
                    }catch(Exception e){updating=false;android.util.Log.e("Onda","Riordino della coda non riuscito",e);}
                }
                resetVisit(item==null?null:item.mediaId);persist();
            }
        });
        instance=this;restore();
    }
    @Override public MediaSession onGetSession(MediaSession.ControllerInfo info){return session;}
    public ExoPlayer player(){return player;}
    private static List<String> strings(JSONArray a){List<String> ids=new ArrayList<>();for(int i=0;i<a.length();i++)ids.add(a.optString(i));return QueueOrder.unique(ids);}
    private List<String> queueIds(){List<String> ids=new ArrayList<>();for(int i=0;i<player.getMediaItemCount();i++)ids.add(player.getMediaItemAt(i).mediaId);return ids;}
    private List<MediaItem> mediaItems(List<String> ids) throws Exception {
        List<MediaItem> result=new ArrayList<>();
        for(String id:ids){JSONObject t=store.requireTrack(id);File file=LibraryStore.mediaFile(this,id);if(!file.isFile())throw new IllegalArgumentException("File del brano non disponibile");
            MediaMetadata.Builder metadata=new MediaMetadata.Builder().setTitle(t.optString("title")).setArtist(t.optString("artist")).setAlbumTitle(t.optString("album")).setIsPlayable(true);
            File cover=LibraryStore.coverFile(this,id);if(cover.isFile())metadata.setArtworkUri(Uri.fromFile(cover));
            result.add(new MediaItem.Builder().setMediaId(id).setUri(Uri.fromFile(file)).setMediaMetadata(metadata.build()).build());
        }return result;
    }
    public void setQueue(JSONObject args) throws Exception {
        List<String> ids=strings(args.getJSONArray("ids"));String id=args.getString("startId");
        if(ids.isEmpty()||!ids.contains(id))throw new IllegalArgumentException("Coda vuota o brano non presente");
        List<MediaItem> items=mediaItems(ids);finishVisit(true);updating=true;
        original=args.has("original")?strings(args.getJSONArray("original")):new ArrayList<>(ids);shuffle=args.optBoolean("shuffle",false);
        try {player.setMediaItems(items,ids.indexOf(id),0);player.prepare();player.play();resetVisit(id);} finally {updating=false;}
        persist();
    }
    public void setRepeat(int mode){if(mode<0||mode>2)throw new IllegalArgumentException("Ripetizione non valida");repeat=mode;player.setRepeatMode(mode==1?Player.REPEAT_MODE_ALL:mode==2?Player.REPEAT_MODE_ONE:Player.REPEAT_MODE_OFF);persist();}
    private void reorder(List<String> ids) throws Exception {
        if(player.getCurrentMediaItem()==null)return;
        String current=player.getCurrentMediaItem().mediaId;long position=player.getCurrentPosition();boolean play=player.getPlayWhenReady();
        if(!ids.contains(current))return;
        List<MediaItem> items=mediaItems(ids);updating=true;
        try{player.setMediaItems(items,ids.indexOf(current),position);player.prepare();player.setPlayWhenReady(play);}finally{updating=false;}
        persist();
    }
    public void toggleShuffle() throws Exception {boolean next=!shuffle;List<String> available=queueIds();
        List<String> base=new ArrayList<>();for(String id:original)if(available.contains(id))base.add(id);for(String id:available)if(!base.contains(id))base.add(id);
        String current=player.getCurrentMediaItem()==null?null:player.getCurrentMediaItem().mediaId;
        reorder(next?QueueOrder.shuffled(base,current,new Random()):base);shuffle=next;persist();
    }
    public void enqueue(String id) throws Exception {if(queueIds().contains(id))return;player.addMediaItem(mediaItems(Collections.singletonList(id)).get(0));original.add(id);persist();}
    public void remove(String id) {if(player.getCurrentMediaItem()!=null&&id.equals(player.getCurrentMediaItem().mediaId)){player.pause();}
        for(int i=player.getMediaItemCount()-1;i>=0;i--)if(id.equals(player.getMediaItemAt(i).mediaId))player.removeMediaItem(i);
        original.remove(id);persist();
    }
    public void refreshMetadata(String id) throws Exception {for(int i=0;i<player.getMediaItemCount();i++)if(id.equals(player.getMediaItemAt(i).mediaId))player.replaceMediaItem(i,mediaItems(Collections.singletonList(id)).get(0));}
    public JSONObject command(String method,JSONObject args) throws Exception {
        switch(method){
            case "setQueue":setQueue(args);break;
            case "select":int index=queueIds().indexOf(args.getString("id"));if(index<0)throw new IllegalArgumentException("Brano non presente nella coda");player.seekTo(index,0);if(player.getPlaybackState()==Player.STATE_IDLE)player.prepare();player.play();break;
            case "play":if(player.getMediaItemCount()>0){if(player.getPlaybackState()==Player.STATE_ENDED){player.seekToDefaultPosition();resetVisit(player.getCurrentMediaItem().mediaId);}if(player.getPlaybackState()==Player.STATE_IDLE)player.prepare();player.play();}break;
            case "pause":player.pause();break;
            case "next":if(player.hasNextMediaItem()){player.seekToNextMediaItem();player.play();}else{finishVisit(true);counted=true;player.pause();}break;
            case "previous":if(player.getCurrentPosition()>3000){player.seekTo(0);}else if(player.hasPreviousMediaItem()){player.seekToPreviousMediaItem();player.play();}else player.seekTo(0);break;
            case "seek":double value=args.getDouble("seconds");if(Double.isFinite(value)&&player.getDuration()>0)player.seekTo(Math.max(0,Math.min((long)(value*1000),player.getDuration())));break;
            case "repeat":setRepeat(args.getInt("value"));break;
            case "shuffle":toggleShuffle();break;
            case "volume":double volume=args.getDouble("value");if(Double.isFinite(volume))player.setVolume((float)Math.max(0,Math.min(1,volume)));break;
            case "enqueue":enqueue(args.getString("id"));break;
            case "state":break;
            default:throw new IllegalArgumentException("Comando non riconosciuto");
        }persist();return snapshot();
    }
    public JSONObject snapshot() throws Exception {
        MediaItem current=player.getCurrentMediaItem();
        return new JSONObject().put("currentId",current==null?JSONObject.NULL:current.mediaId).put("playing",player.isPlaying())
            .put("loading",player.getPlayWhenReady()&&player.getPlaybackState()==Player.STATE_BUFFERING)
            .put("position",Math.max(0,player.getCurrentPosition())/1000.0).put("duration",Math.max(0,player.getDuration())/1000.0)
            .put("queue",new JSONArray(queueIds())).put("shuffle",shuffle).put("repeat",repeat).put("volume",player.getVolume())
            .put("error",player.getPlayerError()==null?"":"File audio non riproducibile: "+player.getPlayerError().getErrorCodeName());
    }
    private void accumulate(){
        long now=SystemClock.elapsedRealtime();if(lastClock>0){heardMs+=Math.min(2000,Math.max(0,now-lastClock));}lastClock=player.isPlaying()?now:0;
        if(visitId!=null&&player.getCurrentMediaItem()!=null&&visitId.equals(player.getCurrentMediaItem().mediaId)&&player.getDuration()>0)visitDuration=player.getDuration();
        long threshold=visitDuration>0?Math.min(30_000,visitDuration/2):30_000;
        if(visitId!=null&&!counted&&heardMs>=threshold){counted=true;store.count(visitId,true);}
    }
    private void finishVisit(boolean manual){accumulate();if(manual&&visitId!=null&&!counted&&heardMs>500)store.count(visitId,false);}
    private void resetVisit(String id){visitId=id;heardMs=0;counted=false;visitDuration=0;
        try{if(id!=null)visitDuration=(long)(store.requireTrack(id).optDouble("duration",0)*1000);}catch(Exception ignored){}
        lastClock=player.isPlaying()?SystemClock.elapsedRealtime():0;
    }
    private void persist(){
        if(updating)return;
        try {JSONObject state=snapshot().put("original",new JSONArray(original)).put("heardMs",heardMs).put("counted",counted);store.setting("player",state);lastSaved=SystemClock.elapsedRealtime();}
        catch(Exception e){android.util.Log.e("Onda","Stato non salvato",e);}
    }
    private void restore(){
        try {Object saved=store.setting("player");if(!(saved instanceof JSONObject))return;JSONObject state=(JSONObject)saved;
            List<String> ids=strings(state.optJSONArray("queue")==null?new JSONArray():state.getJSONArray("queue"));
            ids.removeIf(id->{try{return store.read("tracks",id)==null||!LibraryStore.mediaFile(this,id).isFile();}catch(Exception e){return true;}});
            if(ids.isEmpty())return;String id=state.optString("currentId",ids.get(0));if(!ids.contains(id))id=ids.get(0);
            updating=true;original=strings(state.optJSONArray("original")==null?new JSONArray(ids):state.getJSONArray("original"));shuffle=state.optBoolean("shuffle");
            player.setMediaItems(mediaItems(ids),ids.indexOf(id),(long)(state.optDouble("position",0)*1000));player.setVolume((float)state.optDouble("volume",.7));
            setRepeat(state.optInt("repeat",0));resetVisit(id);heardMs=state.optLong("heardMs",0);counted=state.optBoolean("counted",false);
            // Restore paused: never resume unexpectedly after a reboot or process kill.
        }catch(Exception e){android.util.Log.e("Onda","Ripristino coda non riuscito",e);}finally{updating=false;}
    }
    @Override public void onDestroy(){persist();handler.removeCallbacksAndMessages(null);instance=null;if(session!=null)session.release();if(player!=null)player.release();super.onDestroy();}
}
