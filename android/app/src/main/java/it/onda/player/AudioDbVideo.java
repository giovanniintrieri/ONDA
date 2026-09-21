package it.onda.player;

import java.io.*;
import java.net.*;
import java.util.*;
import org.json.*;

/** TheAudioDB's documented public API exposes the music video in strMusicVid. */
final class AudioDbVideo {
    private long retryAfter;
    private final Map<String, JSONObject> cache = new LinkedHashMap<>();

    JSONObject find(String title, String artist) throws Exception {
        title = DownloadRules.text(title); artist = DownloadRules.text(artist);
        if (title.isEmpty() || artist.isEmpty()) throw new IOException("Scegli un brano con titolo e artista");
        String key = artist + "\n" + title;
        if (cache.containsKey(key)) return new JSONObject(cache.get(key).toString());
        JSONObject result;
        try { result = result(new JSONObject(read(searchUrl(title, artist))), title, artist); }
        catch (JSONException e) { throw new IOException("Risposta TheAudioDB non valida. Riprova."); }
        // Cache successful links only: a retry must be able to recover from missing/temporary data.
        if (!result.optString("url").isEmpty()) {
            if (cache.size() >= 20) cache.remove(cache.keySet().iterator().next());
            cache.put(key, new JSONObject(result.toString()));
        }
        return result;
    }

    static String searchUrl(String title, String artist) throws IOException {
        // 123 is the provider's documented public free key, not the user's Last.fm key.
        return "https://www.theaudiodb.com/api/v1/json/123/searchtrack.php?s=" + URLEncoder.encode(artist, "UTF-8")
            + "&t=" + URLEncoder.encode(title, "UTF-8");
    }

    private static String metadata(String value) {
        String key = DownloadRules.key(value);
        return key.isEmpty() ? DownloadRules.text(value).toLowerCase(Locale.ROOT) : key;
    }

    static JSONObject result(JSONObject raw, String title, String artist) throws Exception {
        if (!raw.has("track")) throw new IOException("Risposta TheAudioDB non valida. Riprova.");
        Object value = raw.opt("track");
        if (value != JSONObject.NULL && !(value instanceof JSONArray) && !(value instanceof JSONObject))
            throw new IOException("Risposta TheAudioDB non valida. Riprova.");
        JSONArray tracks = value instanceof JSONArray ? (JSONArray)value : value instanceof JSONObject ? new JSONArray().put(value) : new JSONArray();
        Set<String> videos = new LinkedHashSet<>();
        String expectedTitle = metadata(title), expectedArtist = metadata(artist);
        if (!expectedTitle.isEmpty() && !expectedArtist.isEmpty()) for (int i = 0; i < tracks.length(); i++) {
            JSONObject track = tracks.optJSONObject(i);
            if (track == null || !expectedTitle.equals(metadata(track.optString("strTrack")))
                || !expectedArtist.equals(metadata(track.optString("strArtist")))) continue;
            String video = LastFmPage.youtube(track.optString("strMusicVid"));
            if (!video.isEmpty()) videos.add(video);
        }
        if (videos.size() == 1) return LastFmPage.result("found", videos.iterator().next(), "Collegamento YouTube trovato tramite TheAudioDB.").put("source", "TheAudioDB");
        return LastFmPage.result(videos.isEmpty() ? "not_found" : "ambiguous", "", videos.isEmpty()
            ? "TheAudioDB non ha restituito un video per questo titolo e artista."
            : "TheAudioDB ha restituito più video per questo brano: il collegamento va verificato.").put("source", "TheAudioDB");
    }

    private String read(String url) throws IOException {
        if (System.currentTimeMillis() < retryAfter) throw new IOException("Troppe richieste a TheAudioDB. Attendi un minuto e riprova.");
        long deadline = System.nanoTime() + 30_000_000_000L;
        HttpURLConnection connection = null;
        try {
            if (Thread.currentThread().isInterrupted()) throw new IOException();
            connection = (HttpURLConnection)new URL(url).openConnection();
            connection.setConnectTimeout(10000); connection.setReadTimeout(20000); connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent", "Onda/" + BuildConfig.VERSION_NAME);
            connection.setRequestProperty("Accept", "application/json");
            int status = connection.getResponseCode();
            if (status == 429) { retryAfter = System.currentTimeMillis() + 60_000; throw new IOException(); }
            if (status != 200) throw new IOException();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = connection.getInputStream()) {
                byte[] buffer = new byte[8192];
                while (true) {
                    long remaining = (deadline - System.nanoTime()) / 1_000_000L;
                    if (remaining <= 0 || Thread.currentThread().isInterrupted()) throw new IOException();
                    connection.setReadTimeout((int)Math.max(1, Math.min(20000, remaining)));
                    int count = in.read(buffer); if (count == -1) break;
                    if (out.size() + count > 2 * 1024 * 1024) throw new IOException();
                    out.write(buffer, 0, count);
                }
            }
            return out.toString("UTF-8");
        } catch (Exception e) {
            // Keep provider responses and URLs out of diagnostics/the bridge.
            throw new IOException(System.currentTimeMillis() < retryAfter ? "Troppe richieste a TheAudioDB. Attendi un minuto e riprova."
                : "TheAudioDB non raggiungibile. Riprova tra qualche istante.");
        } finally { if (connection != null) connection.disconnect(); }
    }
}
