package it.onda.player;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;

/** Separate foreground service: downloading never takes audio focus from the player. */
public final class DownloadService extends Service {
    private static final String CHANNEL="music-downloads", CANCEL="it.onda.player.CANCEL_DOWNLOAD";
    private static final int NOTIFICATION=2301;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wakeLock;
    private MusicDownloads downloads;
    private final Runnable progress=new Runnable(){@Override public void run(){
        if(downloads!=null&&downloads.busy()) {
            NotificationManager manager=getSystemService(NotificationManager.class);
            if(manager.areNotificationsEnabled())manager.notify(NOTIFICATION,notification());
            handler.postDelayed(this,1500);
        }
    }};
    @Override public void onCreate() {
        super.onCreate();downloads=MusicDownloads.get(this);
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Download musicali",NotificationManager.IMPORTANCE_LOW));
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        if(intent!=null&&CANCEL.equals(intent.getAction())){downloads.cancel();if(!downloads.busy())stopSelf();return START_NOT_STICKY;}
        if(!downloads.busy()){stopSelf();return START_NOT_STICKY;}
        try {
            int type=Build.VERSION.SDK_INT>=29?ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC:0;
            if(Build.VERSION.SDK_INT>=35)type|=ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING;
            if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(),type);else startForeground(NOTIFICATION,notification());
            if(wakeLock==null) {
                wakeLock=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Onda:MusicDownloads");
                wakeLock.acquire(6*60*60*1000L);
            }
            downloads.run(()->handler.post(()->{if(!downloads.busy()){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}}));
            handler.removeCallbacks(progress);handler.post(progress);
        }catch(Exception e){Diagnostics.record(this,"servizio download",e);downloads.failToStart();stopSelf();}
        return START_NOT_STICKY;
    }
    @androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
    private Notification notification() {
        JSONObject state=downloads.snapshot();
        String stage=state.optString("stage");
        String label=stage.equals("converting")?"Conversione MP3":stage.equals("cancelling")?"Annullamento…":stage.equals("preparing")?"Preparazione":stage.equals("listing")?"Lettura playlist":stage.equals("metadata")?"Ricerca metadati":stage.equals("importing")?"Aggiunta alla libreria":"Download in corso";
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        PendingIntent cancel=PendingIntent.getService(this,1,new Intent(this,DownloadService.class).setAction(CANCEL),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        int percent=state.optInt("percent",-1);
        return new NotificationCompat.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("Onda · "+label)
            .setContentText(state.optInt("added")+" brani aggiunti").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .setProgress(100,Math.max(0,percent),percent<0).addAction(0,"Annulla",cancel).build();
    }
    @Override public void onTimeout(int startId,int fgsType) {downloads.cancel();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if(downloads!=null&&downloads.busy())downloads.cancel();
        if(wakeLock!=null&&wakeLock.isHeld())wakeLock.release();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) {return null;}
}
