package it.onda.player;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;

/** Last.fm enrichment is optional: a lookup failure never discards the original metadata. */
public final class DownloadMetadata {
    interface Source { JSONObject get(String method, String artist, String title) throws Exception; }
    public static final class Resolved {
        public final JSONObject tags;
        public final String note;
        Resolved(JSONObject tags, String note) { this.tags = tags; this.note = note; }
    }
    private static final Pattern SPECIAL = Pattern.compile("(?i)(?:[\\[(]|\\s[-–—]\\s)[^\\])]*(?:live|remix|acoustic|unplugged|cover|karaoke|instrumental|remaster(?:ed)?|radio edit|extended|sped[ -]?up|slowed|nightcore|demo)\\b");
    private static final Pattern DECORATION = Pattern.compile("(?i)[\\[(]\\s*(?:(?:official|music|lyrics?|video|audio|hd|hq|4k|8k|1080p|720p)\\s*)+[\\])]");
    static JSONObject fallback(JSONObject info) throws Exception {
        String original = DownloadRules.text(info.optString("title"));
        String title = DownloadRules.text(DECORATION.matcher(original).replaceAll(" "));
        String artist = DownloadRules.text(info.optString("artist"));
        JSONArray artists = info.optJSONArray("artists");
        if (artists != null && artists.length() > 0) {
            List<String> values = new ArrayList<>();
            for (int i=0; i<artists.length(); i++) if (!DownloadRules.text(artists.optString(i)).isEmpty()) values.add(DownloadRules.text(artists.optString(i)));
            artist = String.join("; ", values);
        }
        String track = DownloadRules.text(info.optString("track"));
        boolean structured = !track.isEmpty() && !artist.isEmpty() && (!SPECIAL.matcher(original).find() || DownloadRules.key(track).equals(DownloadRules.key(title)));
        if (structured) title = track;
        else {
            artist = "";
            String[] parts = title.split("\\s+[-–—]\\s+", -1);
            if (parts.length == 2 && !parts[0].isEmpty() && !parts[1].isEmpty() && !SPECIAL.matcher(original).find()) {
                String channel = DownloadRules.key(info.optString("channel", info.optString("uploader")).replaceFirst("(?i)(?:\\s*-\\s*Topic|VEVO|\\s+Official)$", ""));
                boolean reversed = !channel.isEmpty() && channel.equals(DownloadRules.key(parts[1])) && !channel.equals(DownloadRules.key(parts[0]));
                artist = reversed ? parts[1] : parts[0]; title = reversed ? parts[0] : parts[1];
            }
        }
        return new JSONObject().put("title", title.isEmpty() ? "Brano" : title).put("artist", artist)
            .put("album", structured ? DownloadRules.text(info.optString("album")) : "")
            .put("genre", structured ? DownloadRules.text(info.optString("genre")) : "");
    }
    static Resolved resolve(JSONObject info, Source source) throws Exception {
        JSONObject tags = fallback(info);
        if (source == null) return new Resolved(tags, "Metadati YouTube · Last.fm non configurato");
        if (tags.optString("artist").isEmpty() || SPECIAL.matcher(info.optString("title")).find())
            return new Resolved(tags, "Metadati YouTube · versione non verificata su Last.fm");
        LinkedHashMap<String,String> genres = new LinkedHashMap<>();
        boolean matched = false;
        try {
            String artist = tags.getString("artist"), title = tags.getString("title");
            JSONObject response = source.get("track.getInfo", artist, title);
            JSONObject track = response.optJSONObject("track");
            if (track == null || !DownloadRules.key(title).equals(DownloadRules.key(track.optString("name"))) ||
                !DownloadRules.key(artist).equals(DownloadRules.key(track.optJSONObject("artist") == null ? "" : track.getJSONObject("artist").optString("name"))))
                return new Resolved(tags, "Metadati YouTube · nessuna corrispondenza sicura su Last.fm");
            double seconds = track.optDouble("duration",0) / 1000, duration = info.optDouble("duration",0);
            if (seconds > 0 && duration > 0 && Math.abs(seconds-duration) > 15)
                return new Resolved(tags, "Metadati YouTube · durata Last.fm diversa");
            matched = true;
            tags.put("title",DownloadRules.text(track.optString("name"))).put("artist",DownloadRules.text(track.getJSONObject("artist").optString("name")));
            if (track.optJSONObject("album") != null && !DownloadRules.text(track.getJSONObject("album").optString("title")).isEmpty()) tags.put("album",DownloadRules.text(track.getJSONObject("album").optString("title")));
            collect(track.optJSONObject("toptags"), genres);
            String scope = genres.isEmpty() ? "artist" : "track";
            JSONObject extra = source.get(scope + ".getTopTags", artist, title).optJSONObject("toptags");
            JSONObject owner = extra == null ? null : extra.optJSONObject("@attr");
            boolean sameOwner = owner == null || ((!owner.has("artist") || DownloadRules.key(owner.optString("artist")).equals(DownloadRules.key(artist))) &&
                (!owner.has("track") || DownloadRules.key(owner.optString("track")).equals(DownloadRules.key(title))));
            if (sameOwner) collect(extra, genres);
        } catch (Exception ignored) {
            // Do not expose request URLs, API keys or upstream error bodies to the WebView/logs.
            if (!genres.isEmpty()) tags.put("genre",String.join("; ",genres.values()));
            return new Resolved(tags, matched ? "Metadati Last.fm · alcuni tag non disponibili" : "Last.fm non disponibile · mantenuti i metadati YouTube");
        }
        if (!genres.isEmpty()) tags.put("genre",String.join("; ",genres.values()));
        return new Resolved(tags,"Metadati Last.fm");
    }
    private static void collect(JSONObject container, LinkedHashMap<String,String> tags) {
        if (container == null) return;
        Object raw = container.opt("tag");
        JSONArray values = raw instanceof JSONArray ? (JSONArray)raw : raw instanceof JSONObject ? new JSONArray().put(raw) : new JSONArray();
        for (int i=0; i<values.length(); i++) {
            JSONObject value=values.optJSONObject(i);
            String name=DownloadRules.text(value == null ? values.optString(i) : value.optString("name"));
            if (!name.isEmpty()) tags.putIfAbsent(name.toLowerCase(Locale.ROOT),name);
        }
    }
    /** One client per queue: bounded cache and rate limiting, never saved to disk. */
    public static final class Client {
        private final Map<String,JSONObject> cache = new LinkedHashMap<>();
        private long nextRequest, retryAfter;
        public Resolved enrich(JSONObject info, String apiKey, DownloadBackend.Cancellation cancellation) throws Exception {
            long deadline = System.nanoTime() + 12_000_000_000L;
            return resolve(info, apiKey.isEmpty() ? null : (method,artist,title) -> {
                cancellation.check();
                String key = method + "\n" + artist + "\n" + title;
                if (cache.containsKey(key)) return cache.get(key);
                long now = System.currentTimeMillis();
                if (now < retryAfter) throw new IOException();
                if (nextRequest > now) Thread.sleep(Math.min(300,nextRequest-now));
                cancellation.check();
                if (System.nanoTime() >= deadline) throw new IOException();
                String query = "method=" + method + "&format=json&autocorrect=0&api_key=" + encode(apiKey) + "&artist=" + encode(artist);
                if (!method.startsWith("artist.")) query += "&track=" + encode(title);
                HttpURLConnection connection = (HttpURLConnection)new URL("https://ws.audioscrobbler.com/2.0/?" + query).openConnection();
                connection.setConnectTimeout(4000); connection.setReadTimeout(4000); connection.setInstanceFollowRedirects(false);
                nextRequest = System.currentTimeMillis() + 300;
                try {
                    int status=connection.getResponseCode();
                    if (status==429 || status==503) { retryAfter=System.currentTimeMillis()+60_000; throw new IOException(); }
                    if (status!=200) throw new IOException();
                    ByteArrayOutputStream out=new ByteArrayOutputStream();
                    try(InputStream in=connection.getInputStream()) {
                        byte[] buffer=new byte[8192]; int n;
                        while((n=in.read(buffer))!=-1) {
                            cancellation.check();
                            if (out.size()+n>2*1024*1024 || System.nanoTime()>=deadline) throw new IOException();
                            out.write(buffer,0,n);
                        }
                    }
                    JSONObject json=new JSONObject(out.toString("UTF-8"));
                    if (json.has("error")) { if (json.optInt("error")==29) retryAfter=System.currentTimeMillis()+60_000; throw new IOException(); }
                    if(cache.size()>=200) cache.remove(cache.keySet().iterator().next());
                    cache.put(key,json);return json;
                } finally { connection.disconnect(); }
            });
        }
        private static String encode(String value) throws Exception { return URLEncoder.encode(value, StandardCharsets.UTF_8.name()); }
    }
}
