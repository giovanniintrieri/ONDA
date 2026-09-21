package it.onda.player;

import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import android.webkit.WebView;
import androidx.core.app.NotificationManagerCompat;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

/** Bounded, persistent error history. Does not collect music titles or file paths. */
public final class Diagnostics {
    private Diagnostics() {}
    public static synchronized void record(Context context, String operation, Throwable error) {
        record(context, operation, error.getClass().getSimpleName());
    }
    public static synchronized void record(Context context, String operation, String code) {
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences("diagnostics", Context.MODE_PRIVATE);
            JSONArray old = new JSONArray(prefs.getString("errors", "[]")), next = new JSONArray();
            for (int i=Math.max(0,old.length()-39);i<old.length();i++) next.put(old.get(i));
            next.put(new JSONObject().put("time",System.currentTimeMillis()).put("operation",operation).put("code",code));
            prefs.edit().putString("errors",next.toString()).apply();
        } catch (Exception ignored) { /* Diagnostics must never break playback. */ }
    }
    public static synchronized String report(Context context, JSONObject player, String uiErrors) throws Exception {
        SimpleDateFormat date = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss Z", Locale.ROOT);
        StringBuilder text = new StringBuilder("Onda — Diagnostica\n");
        text.append("Data: ").append(date.format(new Date())).append('\n');
        text.append("Versione: ").append(BuildConfig.VERSION_NAME).append(" (").append(BuildConfig.VERSION_CODE).append(")\n");
        text.append("Dispositivo: ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append('\n');
        text.append("Android: ").append(Build.VERSION.RELEASE).append(" / API ").append(Build.VERSION.SDK_INT).append('\n');
        android.content.pm.PackageInfo webview = WebView.getCurrentWebViewPackage();
        text.append("WebView: ").append(webview==null ? "non disponibile" : webview.versionName).append('\n');
        text.append("Spazio disponibile: ").append(context.getFilesDir().getUsableSpace()/1_048_576).append(" MiB\n");
        text.append("Notifiche consentite: ").append(NotificationManagerCompat.from(context).areNotificationsEnabled() ? "sì" : "no").append('\n');
        PowerManager power = (PowerManager)context.getSystemService(Context.POWER_SERVICE);
        text.append("Risparmio energetico: ").append(power.isPowerSaveMode() ? "attivo" : "disattivo").append('\n');
        text.append("Ottimizzazione batteria: ").append(power.isIgnoringBatteryOptimizations(context.getPackageName()) ? "esclusa" : "attiva").append('\n');
        text.append("Lettore: ").append(player==null ? "servizio non pronto" : player.optBoolean("loading") ? "caricamento" : player.optBoolean("playing") ? "in riproduzione" : "in pausa").append('\n');
        if(player!=null) {
            text.append("Coda: ").append(player.getJSONArray("queue").length()).append(" brani\n");
            text.append("Posizione: ").append(player.optDouble("position")).append(" / ").append(player.optDouble("duration")).append(" s\n");
            text.append("Casuale intelligente: ").append(player.optBoolean("shuffle")).append(" · Ripetizione: ").append(player.optInt("repeat")).append('\n');
            text.append("Errore audio: ").append(player.optString("error", "").isEmpty() ? "nessuno" : player.optString("error")).append('\n');
        }
        JSONArray errors = new JSONArray(context.getSharedPreferences("diagnostics",Context.MODE_PRIVATE).getString("errors","[]"));
        text.append("\nErrori recenti (massimo 40):\n");
        if(errors.length()==0) text.append("Nessuno registrato.\n");
        for(int i=0;i<errors.length();i++) { JSONObject e=errors.getJSONObject(i);text.append(date.format(new Date(e.getLong("time")))).append(" · ").append(e.optString("operation")).append(" · ").append(e.optString("code")).append('\n'); }
        if(!uiErrors.isEmpty()) text.append("\nInterfaccia (sessione corrente):\n").append(uiErrors);
        return text.toString();
    }
}
