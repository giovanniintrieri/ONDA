package it.onda.player;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.*;

/** Network-independent validation shared by every download backend. */
public final class DownloadRules {
    public static final int MAX_TRACKS = 500, MAX_SECONDS = 3600;
    public static final long MAX_BYTES = 200L * 1024 * 1024;
    private DownloadRules() {}
    public static String video(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{11}")) throw new IllegalArgumentException("Video YouTube non valido");
        return "https://www.youtube.com/watch?v=" + id;
    }
    public static String url(String input, boolean playlist) {
        try {
            if (input == null || input.length() > 2048) throw new Exception();
            URI uri = new URI(input.trim());
            String host = Objects.toString(uri.getHost(), "").toLowerCase(Locale.ROOT);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1 ||
                !Arrays.asList("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be").contains(host)) throw new Exception();
            Map<String,String> query = new HashMap<>();
            if (uri.getRawQuery() != null) for (String part : uri.getRawQuery().split("&")) {
                String[] pair = part.split("=", 2);
                String name = URLDecoder.decode(pair[0], StandardCharsets.UTF_8.name());
                if (query.put(name, pair.length == 2 ? URLDecoder.decode(pair[1], StandardCharsets.UTF_8.name()) : "") != null) throw new Exception();
            }
            if (playlist) {
                String list = query.getOrDefault("list", "");
                if (!list.matches("[A-Za-z0-9_-]{10,160}")) throw new Exception();
                return "https://www.youtube.com/playlist?list=" + list;
            }
            String path = uri.getPath();
            String id = host.equals("youtu.be") ? path.substring(1) : path.equals("/watch") ? query.get("v") :
                path.matches("/(shorts|embed)/[A-Za-z0-9_-]{11}") ? path.substring(path.lastIndexOf('/') + 1) : "";
            return video(id);
        } catch (Exception e) { throw new IllegalArgumentException(playlist ? "Incolla un link HTTPS a una playlist YouTube" : "Incolla un link HTTPS a un video YouTube"); }
    }
    public static String text(String value) {
        String clean = Objects.toString(value, "").replaceAll("[\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        return clean.substring(0, Math.min(clean.length(), 300));
    }
    public static String key(String value) {
        return Normalizer.normalize(text(value), Normalizer.Form.NFKD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
    }
    public static String filename(String title) {
        String clean = text(title).replaceAll("[<>:\"/\\\\|?*]", "-").replaceAll("^[. ]+|[. ]+$", "");
        if (clean.isEmpty()) clean = "Brano";
        int end = clean.offsetByCodePoints(0, Math.min(120, clean.codePointCount(0, clean.length())));
        clean = clean.substring(0, end);
        if (clean.matches("(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\..*)?")) clean = "_" + clean;
        return clean + ".mp3";
    }
    public static boolean complete(String status) { return "added".equals(status) || "duplicate".equals(status); }
}
