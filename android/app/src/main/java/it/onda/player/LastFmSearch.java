package it.onda.player;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.*;

/** Read-only Last.fm discovery. Never downloads audio or exposes the API key to the UI. */
public final class LastFmSearch {
    private long retryAfter;
    private final Map<String, JSONObject> cache = new LinkedHashMap<>();

    public JSONObject search(String title, String artist, int page, String key) throws Exception {
        title = DownloadRules.text(title); artist = DownloadRules.text(artist);
        if (title.isEmpty() && artist.isEmpty()) throw new IOException("Scrivi un titolo o il nome di un artista");
        boolean artists = title.isEmpty();
        JSONObject raw = query(artists ? "artist.search" : "track.search", title, artist, page, key);
        return artists ? artistResults(raw, page) : trackResults(raw, page, title, artist);
    }

    public JSONObject artistTracks(String artist, int page, String key) throws Exception {
        artist = DownloadRules.text(artist);
        if (artist.isEmpty()) throw new IOException("Scegli un artista");
        return topTracks(query("artist.getTopTracks", "", artist, page, key), page, artist);
    }

    private JSONObject query(String method, String title, String artist, int page, String key) throws Exception {
        if (page < 1 || page > 100) throw new IOException("Pagina di ricerca non valida");
        if (!key.matches("[A-Za-z0-9]{32}")) throw new IOException("Configura la chiave Last.fm in Scarica musica");
        String cacheKey = method + "\n" + key + "\n" + title + "\n" + artist + "\n" + page;
        if (cache.containsKey(cacheKey)) return new JSONObject(cache.get(cacheKey).toString());
        String url = "https://ws.audioscrobbler.com/2.0/?method=" + method + "&format=json&autocorrect=0&limit=20&page=" + page
            + "&artist=" + encode(artist) + "&api_key=" + encode(key);
        if (method.equals("track.search")) url += "&track=" + encode(title);
        JSONObject raw;
        try { raw = new JSONObject(read(url, true)); }
        catch (JSONException e) { throw new IOException("Risposta Last.fm non valida. Riprova."); }
        if (raw.optInt("error") == 29) retryAfter = System.currentTimeMillis() + 60_000;
        checkError(raw);
        if (cache.size() >= 20) cache.remove(cache.keySet().iterator().next());
        cache.put(cacheKey, raw);
        return new JSONObject(raw.toString());
    }

    private static void checkError(JSONObject raw) throws IOException {
        if (!raw.has("error")) return;
        int code = raw.optInt("error");
        throw new IOException(code == 10 || code == 26 ? "Chiave Last.fm non valida o sospesa. Controllala in Scarica musica."
            : code == 29 ? "Troppe richieste a Last.fm. Attendi un minuto e riprova."
            : "Last.fm non disponibile. Riprova più tardi.");
    }

    private static JSONArray array(Object value) {
        return value instanceof JSONArray ? (JSONArray)value : value instanceof JSONObject ? new JSONArray().put(value) : new JSONArray();
    }

    static JSONObject artistResults(JSONObject raw, int page) throws Exception {
        checkError(raw);
        JSONObject results = raw.optJSONObject("results");
        if (results == null) throw new IOException("Risposta Last.fm non valida. Riprova.");
        JSONObject matches = results.optJSONObject("artistmatches");
        JSONArray input = array(matches == null ? null : matches.opt("artist"));
        JSONArray artists = new JSONArray(); Set<String> seen = new HashSet<>();
        for (int i = 0; i < Math.min(input.length(), 20); i++) {
            JSONObject item = input.optJSONObject(i); if (item == null) continue;
            String name = DownloadRules.text(item.optString("name"));
            if (!name.isEmpty() && seen.add(name.toLowerCase(Locale.ROOT))) artists.put(new JSONObject().put("name", name));
        }
        return new JSONObject().put("kind", "artists").put("artists", artists).put("tracks", new JSONArray()).put("page", page)
            .put("hasMore", page < 100 && results.optLong("opensearch:totalResults", 0) > page * 20L);
    }

    static JSONObject topTracks(JSONObject raw, int page, String artist) throws Exception {
        checkError(raw);
        JSONObject top = raw.optJSONObject("toptracks");
        if (top == null) throw new IOException("Elenco dei brani Last.fm non disponibile. Riprova.");
        JSONArray input = array(top.opt("track")), tracks = new JSONArray();
        for (int i = 0; i < Math.min(input.length(), 20); i++) {
            JSONObject original = input.optJSONObject(i); if (original == null) continue;
            JSONObject track = new JSONObject(original.toString());
            JSONObject owner = track.optJSONObject("artist");
            track.put("artist", owner == null ? artist : owner.optString("name", artist));
            tracks.put(track);
        }
        JSONObject attributes = top.optJSONObject("@attr");
        long total = attributes == null ? 0 : attributes.optLong("total", 0);
        return results(new JSONObject().put("results", new JSONObject().put("trackmatches", new JSONObject().put("track", tracks))
            .put("opensearch:totalResults", total)), page);
    }

    /** Last.fm may match the query against the artist too. Enforce each field locally. */
    static JSONObject trackResults(JSONObject raw, int page, String title, String artist) throws Exception {
        JSONObject result = results(raw, page);
        JSONArray candidates = result.getJSONArray("tracks"), matches = new JSONArray();
        String titleQuery = searchText(title), artistQuery = searchText(artist);
        for (int i = 0; i < candidates.length(); i++) {
            JSONObject track = candidates.getJSONObject(i);
            if (searchText(track.getString("title")).contains(titleQuery)
                && (artistQuery.isEmpty() || searchText(track.getString("artist")).contains(artistQuery))) matches.put(track);
        }
        // Keep the provider's pagination: a filtered-out page does not imply the next is empty.
        return result.put("tracks", matches);
    }

    private static String searchText(String value) {
        String text = DownloadRules.text(value).toLowerCase(Locale.ROOT);
        String normalized = Normalizer.normalize(text, Normalizer.Form.NFKD).replaceAll("\\p{M}", "")
            .replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
        return normalized.isEmpty() ? text : normalized;
    }

    static JSONObject results(JSONObject raw, int page) throws Exception {
        checkError(raw);
        JSONObject results = raw.optJSONObject("results");
        if (results == null) throw new IOException("Risposta Last.fm non valida. Riprova.");
        JSONObject matches = results.optJSONObject("trackmatches");
        Object value = matches == null ? null : matches.opt("track");
        JSONArray input = array(value);
        JSONArray tracks = new JSONArray(); Set<String> seen = new HashSet<>();
        for (int i = 0; i < Math.min(input.length(), 20); i++) {
            JSONObject item = input.optJSONObject(i); if (item == null) continue;
            String name = DownloadRules.text(item.optString("name")), artist = DownloadRules.text(item.optString("artist"));
            if (name.isEmpty() || artist.isEmpty()) continue;
            String url;
            try { url = trackUrl(item.optString("url")); } catch (IOException e) { continue; }
            if (seen.add(url)) tracks.put(new JSONObject().put("title", name).put("artist", artist).put("url", url));
        }
        return new JSONObject().put("kind", "tracks").put("tracks", tracks).put("page", page)
            .put("hasMore", page < 100 && results.optLong("opensearch:totalResults", 0) > page * 20L);
    }

    /** Only canonical track pages on Last.fm; no arbitrary URLs, ports, credentials or redirects. */
    static String trackUrl(String value) throws IOException {
        try {
            if (value.length() > 2048) throw new Exception();
            URI uri = new URI(value);
            if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getUserInfo() != null
                || uri.getPort() != -1 || !Arrays.asList("www.last.fm", "last.fm").contains(uri.getHost())
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !uri.getRawPath().matches("/music/[^/]+/_/[^/]+/?")) throw new Exception();
            // Reject decoded traversal and separators as well as literal path tricks.
            for (String part : uri.getRawPath().split("/")) {
                String decoded = URLDecoder.decode(part, "UTF-8");
                if (decoded.equals(".") || decoded.equals("..") || decoded.contains("\\") || decoded.contains("/") || decoded.matches(".*[\\p{Cntrl}].*")) throw new Exception();
            }
            return "https://www.last.fm" + uri.getRawPath();
        } catch (Exception e) { throw new IOException("Pagina del brano Last.fm non valida"); }
    }

    static String videoFromPage(String html) throws IOException {
        try { return LastFmPage.inspect(html, "").optString("url"); }
        catch (Exception e) { throw new IOException("Pagina Last.fm non leggibile"); }
    }

    public JSONObject resolve(String url) throws Exception {
        String canonical = trackUrl(url);
        return LastFmPage.inspect(read(canonical, false), canonical);
    }

    private String read(String url, boolean api) throws IOException {
        if (System.currentTimeMillis() < retryAfter) throw new IOException("Troppe richieste a Last.fm. Attendi un minuto e riprova.");
        long deadline = System.nanoTime() + 15_000_000_000L;
        try {
            for (int redirects = 0; redirects < 4; redirects++) {
                if (Thread.currentThread().isInterrupted()) throw new IOException();
                HttpURLConnection connection = (HttpURLConnection)new URL(url).openConnection();
                connection.setConnectTimeout(4000); connection.setReadTimeout(4000); connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("User-Agent", "Onda/" + BuildConfig.VERSION_NAME);
                connection.setRequestProperty("Accept", api ? "application/json" : "text/html");
                try {
                    int status = connection.getResponseCode();
                    if (status == 429 || status == 503) {
                        retryAfter = System.currentTimeMillis() + 60_000;
                        throw new IOException();
                    }
                    if (!api && Arrays.asList(301, 302, 303, 307, 308).contains(status)) {
                        URI target = new URI(url).resolve(connection.getHeaderField("Location"));
                        if (!"https".equals(target.getScheme())) throw new IOException();
                        url = trackUrl(target.toString());
                        if (System.nanoTime() >= deadline) throw new IOException();
                        continue;
                    }
                    if (status != 200) throw new IOException();
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    try (InputStream in = connection.getInputStream()) {
                        byte[] buffer = new byte[8192]; int n;
                        while ((n = in.read(buffer)) != -1) {
                            if (out.size() + n > 2 * 1024 * 1024 || System.nanoTime() >= deadline || Thread.currentThread().isInterrupted()) throw new IOException();
                            out.write(buffer, 0, n);
                        }
                    }
                    return out.toString("UTF-8");
                } finally { connection.disconnect(); }
            }
            throw new IOException();
        } catch (Exception e) {
            // Never forward URLs, keys, upstream bodies or exception causes to logs/the bridge.
            throw new IOException(System.currentTimeMillis() < retryAfter ? "Last.fm temporaneamente non disponibile. Attendi un minuto e riprova."
                : api ? "Ricerca non riuscita. Controlla la connessione e riprova."
                : "Impossibile leggere il collegamento YouTube. Riprova o apri la pagina Last.fm.");
        }
    }
    private static String encode(String value) throws Exception { return URLEncoder.encode(value, StandardCharsets.UTF_8.name()); }
}
