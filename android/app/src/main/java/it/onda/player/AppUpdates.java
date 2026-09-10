package it.onda.player;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.*;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.database.Cursor;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Main-thread state; downloads belong to Android and survive Activity/process recreation. */
final class AppUpdates {
    interface Listener { void changed(JSONObject state); }
    private static AppUpdates instance;
    static synchronized AppUpdates get(Context context) {
        if (instance == null) instance = new AppUpdates(context.getApplicationContext());
        return instance;
    }

    private final Context context;
    private final DownloadManager downloads;
    private final SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Set<Listener> listeners = new HashSet<>();
    private UpdateRelease release;
    private String phase = "idle", error = "", downloadName = "", downloadMessage = "";
    private long downloadId = -1, received;
    private boolean querying;
    private final Runnable poll = () -> refreshDownload();

    private AppUpdates(Context context) {
        this.context = context;
        downloads = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        prefs = context.getSharedPreferences("app-updates", Context.MODE_PRIVATE);
        if (BuildConfig.UPDATE_MANIFEST_URL.isEmpty()) { phase = "disabled"; return; }
        ContextCompat.registerReceiver(context, new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent intent) {
                if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())
                        && intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -2) == downloadId) {
                    refreshDownload();
                }
            }
        }, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
        try {
            String saved = prefs.getString("release", "");
            if (!saved.isEmpty()) {
                release = parseRelease(saved);
                downloadId = prefs.getLong("downloadId", -1);
                downloadName = prefs.getString("downloadName", "");
                if (release.versionCode <= BuildConfig.VERSION_CODE) { clearDownload(); release = null; }
                else if (prefs.getBoolean("ready", false) && readyFile().isFile()) verify(readyFile(), false);
                else if (downloadId >= 0) { phase = "downloading"; refreshDownload(); }
                else phase = "available";
            }
        } catch (Exception e) { clearDownload(); release = null; }
    }

    void observe(Listener listener) { listeners.add(listener); listener.changed(snapshot()); refreshDownload(); }
    void remove(Listener listener) { listeners.remove(listener); if (listeners.isEmpty()) main.removeCallbacks(poll); }

    JSONObject snapshot() {
        JSONObject state = new JSONObject();
        try {
            state.put("phase", phase).put("error", error).put("downloadMessage", downloadMessage)
                    .put("installedVersion", BuildConfig.VERSION_NAME).put("receivedBytes", received);
            if (release != null) state.put("version", release.versionName).put("sizeBytes", release.sizeBytes);
        } catch (Exception ignored) { }
        return state;
    }

    private void emit() {
        JSONObject state = snapshot();
        for (Listener listener : new ArrayList<>(listeners)) listener.changed(state);
    }

    void check(boolean manual) {
        if (BuildConfig.UPDATE_MANIFEST_URL.isEmpty() || "checking".equals(phase) || busy() || "ready".equals(phase)) { emit(); return; }
        long now = System.currentTimeMillis(), elapsed = now - prefs.getLong("lastCheck", 0);
        if (!manual && elapsed >= 0 && elapsed < 30 * 60 * 1000L) return;
        prefs.edit().putLong("lastCheck", now).apply();
        phase = "checking"; error = ""; emit();
        worker.execute(() -> {
            try {
                UpdateRelease found = parseRelease(fetchManifest());
                if (found.versionCode > BuildConfig.VERSION_CODE && found.minSdk > Build.VERSION.SDK_INT) {
                    main.post(() -> { release = null; save(); fail("La nuova versione richiede una versione Android più recente."); });
                    return;
                }
                main.post(() -> {
                    release = found.versionCode > BuildConfig.VERSION_CODE ? found : null;
                    phase = release == null ? "current" : "available";
                    save(); emit();
                });
            } catch (Exception e) { main.post(() -> fail("Impossibile controllare gli aggiornamenti. Verifica la connessione e riprova.")); }
        });
    }

    void download() throws Exception {
        if (busy() || "checking".equals(phase)) return;
        if (release == null || release.versionCode <= BuildConfig.VERSION_CODE) throw new IOException("Controlla prima gli aggiornamenti.");
        if ("ready".equals(phase)) { emit(); return; }
        if (downloads == null) throw new IOException("Il gestore download di Android non è disponibile.");
        File directory = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) throw new IOException("La memoria per il download non è disponibile.");
        if (directory.getUsableSpace() < release.sizeBytes + 10 * 1024 * 1024L
                || context.getCacheDir().getUsableSpace() < release.sizeBytes * 2 + 10 * 1024 * 1024L) {
            throw new IOException("Spazio insufficiente per l’aggiornamento.");
        }
        clearDownload();
        downloadName = "onda-" + release.versionCode + "-" + System.currentTimeMillis() + ".apk";
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(release.apkUrl))
                .setTitle("Onda " + release.versionName).setDescription("Download aggiornamento")
                .setMimeType("application/octet-stream")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, downloadName);
        downloadId = downloads.enqueue(request);
        phase = "downloading"; received = 0; error = ""; downloadMessage = "";
        save(); emit(); refreshDownload();
    }

    void cancel() {
        if (BuildConfig.UPDATE_MANIFEST_URL.isEmpty() || "verifying".equals(phase) || "checking".equals(phase)) return;
        clearDownload(); phase = release == null ? "idle" : "available"; error = "";
        save(); emit();
    }

    private boolean busy() { return "downloading".equals(phase) || "verifying".equals(phase); }

    private void refreshDownload() {
        main.removeCallbacks(poll);
        if (!"downloading".equals(phase) || downloadId < 0 || querying) return;
        final long id = downloadId;
        querying = true;
        worker.execute(() -> {
            int status = -1; long bytes = 0;
            try (Cursor cursor = downloads.query(new DownloadManager.Query().setFilterById(id))) {
                if (cursor != null && cursor.moveToFirst()) {
                    status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                }
            } catch (Exception ignored) { }
            final int result = status; final long done = bytes;
            main.post(() -> {
                querying = false;
                if (downloadId != id || !"downloading".equals(phase)) { refreshDownload(); return; }
                received = Math.max(0, done);
                if (release == null || received > release.sizeBytes) { clearDownload(); fail("La dimensione dell’aggiornamento non corrisponde. Riprova."); return; }
                if (result == DownloadManager.STATUS_SUCCESSFUL) {
                    File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null || !downloadName.matches("onda-[0-9]+-[0-9]+\\.apk")) { fail("Download non disponibile. Riprova."); return; }
                    verify(new File(dir, downloadName), true); return;
                }
                if (result == -1 || result == DownloadManager.STATUS_FAILED) { clearDownload(); fail("Download non riuscito. Verifica la connessione e lo spazio disponibile, poi riprova."); return; }
                downloadMessage = result == DownloadManager.STATUS_PAUSED ? "In attesa della connessione…" : "";
                emit();
                if (!listeners.isEmpty()) main.postDelayed(poll, 1000);
            });
        });
    }

    private File readyFile() { return new File(context.getCacheDir(), "updates/onda.apk"); }

    private void verify(File source, boolean copy) {
        final UpdateRelease expected = release;
        phase = "verifying"; error = ""; emit();
        worker.execute(() -> {
            File target = readyFile(), temporary = new File(target.getParentFile(), "onda.apk.part");
            try {
                if (expected == null) throw new IOException("Aggiornamento mancante.");
                if (copy) {
                    if (!target.getParentFile().isDirectory() && !target.getParentFile().mkdirs()) throw new IOException("Memoria non disponibile.");
                    try (InputStream in = new FileInputStream(source); OutputStream out = new FileOutputStream(temporary)) {
                        byte[] buffer = new byte[65536]; long size = 0; int count;
                        while ((count = in.read(buffer)) != -1) {
                            size += count;
                            if (size > expected.sizeBytes) throw new IOException("Dimensione dell’aggiornamento non valida.");
                            out.write(buffer, 0, count);
                        }
                    }
                    validateApk(temporary, expected);
                    if (target.exists() && !target.delete()) throw new IOException("Memoria non disponibile.");
                    if (!temporary.renameTo(target)) throw new IOException("Impossibile conservare l’aggiornamento.");
                } else validateApk(target, expected);
                main.post(() -> {
                    if (downloadId >= 0) { try { downloads.remove(downloadId); } catch (Exception ignored) { } }
                    downloadId = -1; downloadName = "";
                    phase = "ready"; received = expected.sizeBytes; save(); emit();
                });
            } catch (Exception e) {
                temporary.delete();
                android.util.Log.w("OndaUpdates", "Verifica aggiornamento fallita", e);
                main.post(() -> { clearDownload(); fail("Il file è incompleto o non corrisponde a questa app. Prova a scaricarlo di nuovo."); });
            }
        });
    }

    @SuppressWarnings("deprecation")
    private void validateApk(File file, UpdateRelease expected) throws Exception {
        if (file.length() != expected.sizeBytes) throw new IOException("File incompleto.");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[65536]; int count;
            while ((count = in.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        if (!hex(digest.digest()).equals(expected.sha256)) throw new IOException("Checksum differente.");
        PackageManager manager = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo installed = manager.getPackageInfo(context.getPackageName(), flags);
        if (archive == null || !context.getPackageName().equals(archive.packageName)) throw new IOException("Applicazione differente.");
        long version = Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode;
        if (version != expected.versionCode || version <= BuildConfig.VERSION_CODE
                || !expected.versionName.equals(archive.versionName) || archive.applicationInfo == null
                || archive.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT) throw new IOException("Versione incompatibile.");
        Set<String> currentSigners = signers(installed), newSigners = signers(archive);
        if (currentSigners.isEmpty() || !currentSigners.equals(newSigners)) throw new IOException("Firma differente.");
    }

    @SuppressWarnings("deprecation")
    private Set<String> signers(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28
                ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        Set<String> values = new HashSet<>();
        if (signatures != null) for (Signature signature : signatures) {
            values.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));
        }
        return values;
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b & 255));
        return out.toString();
    }

    void install(Activity activity) throws Exception {
        if (!"ready".equals(phase) || !readyFile().isFile()) { fail("Scarica nuovamente l’aggiornamento."); return; }
        if (!context.getPackageManager().canRequestPackageInstalls()) {
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName())));
            return;
        }
        // Always let the system validate the signed package and ask for confirmation.
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".updates", readyFile());
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri("Onda", uri));
        activity.startActivity(intent);
    }

    private String fetchManifest() throws Exception {
        URL url = UpdateRelease.https(BuildConfig.UPDATE_MANIFEST_URL);
        for (int redirects = 0; redirects <= 5; redirects++) {
            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
            connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
            connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-cache");
            try {
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("Indirizzo mancante.");
                    url = UpdateRelease.https(new URL(url, location).toString()); continue;
                }
                if (status != 200) throw new IOException("Aggiornamento non disponibile.");
                try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[4096]; int count;
                    while ((count = in.read(buffer)) != -1) {
                        if (out.size() + count > 65536) throw new IOException("Risposta troppo grande.");
                        out.write(buffer, 0, count);
                    }
                    return new String(out.toByteArray(), StandardCharsets.UTF_8);
                }
            } finally { connection.disconnect(); }
        }
        throw new IOException("Troppi reindirizzamenti.");
    }

    private static UpdateRelease parseRelease(String text) throws Exception {
        JSONObject json = new JSONObject(text);
        Map<String, Object> values = new HashMap<>();
        for (String key : UpdateRelease.FIELDS) values.put(key, json.get(key));
        return new UpdateRelease(values);
    }

    private void clearDownload() {
        main.removeCallbacks(poll);
        if (downloadId >= 0 && downloads != null) { try { downloads.remove(downloadId); } catch (Exception ignored) { } }
        downloadId = -1; downloadName = ""; received = 0; downloadMessage = "";
        readyFile().delete();
        prefs.edit().remove("downloadId").remove("downloadName").remove("ready").remove("release").apply();
    }

    private void save() {
        try {
            prefs.edit().putString("release", release == null ? "" : new JSONObject(release.values()).toString())
                    .putLong("downloadId", downloadId).putString("downloadName", downloadName)
                    .putBoolean("ready", "ready".equals(phase)).apply();
        } catch (Exception e) { fail("Impossibile conservare lo stato dell’aggiornamento."); }
    }

    private void fail(String message) { phase = "error"; error = message; emit(); }
}
