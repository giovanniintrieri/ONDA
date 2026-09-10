package it.onda.player;

import java.io.IOException;
import java.net.URI;
import java.net.URL;
import java.util.Locale;
import java.util.Map;
import java.util.LinkedHashMap;

/** The manifest is untrusted, even when fetched from the configured HTTPS source. */
final class UpdateRelease {
    static final long MAX_APK_BYTES = 200L * 1024 * 1024;
    static final String[] FIELDS = {"applicationId", "versionCode", "minSdk", "sizeBytes", "versionName", "apkUrl", "sha256"};
    final int versionCode, minSdk;
    final String versionName, apkUrl, sha256;
    final long sizeBytes;

    UpdateRelease(Map<String, Object> json) throws Exception {
        if (!"it.onda.player".equals(string(json, "applicationId"))) {
            throw new IOException("L’aggiornamento non appartiene a Onda.");
        }
        long code = integer(json, "versionCode");
        long sdk = integer(json, "minSdk");
        sizeBytes = integer(json, "sizeBytes");
        if (code < 1 || code > 2100000000 || sdk < 26 || sdk > 1000
                || sizeBytes < 1 || sizeBytes > MAX_APK_BYTES) {
            throw new IOException("Informazioni dell’aggiornamento non valide.");
        }
        versionCode = (int) code;
        minSdk = (int) sdk;
        versionName = string(json, "versionName");
        if (!versionName.matches("[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}")) {
            throw new IOException("Nome della versione non valido.");
        }
        apkUrl = https(string(json, "apkUrl")).toString();
        sha256 = string(json, "sha256").toLowerCase(Locale.ROOT);
        if (!sha256.matches("[0-9a-f]{64}")) throw new IOException("Verifica dell’aggiornamento mancante.");
    }

    private static String string(Map<String, Object> json, String key) throws IOException {
        Object value = json.get(key);
        if (!(value instanceof String)) throw new IOException("Informazioni mancanti: " + key);
        return (String) value;
    }

    private static long integer(Map<String, Object> json, String key) throws Exception {
        Object value = json.get(key);
        if (!(value instanceof Integer) && !(value instanceof Long)) {
            throw new IOException("Informazioni dell’aggiornamento non valide: " + key);
        }
        return ((Number) value).longValue();
    }

    static URL https(String text) throws Exception {
        URI uri = new URI(text);
        if (text.length() > 4096 || !"https".equalsIgnoreCase(uri.getScheme())
                || uri.getHost() == null || uri.getUserInfo() != null || uri.getFragment() != null) {
            throw new IOException("L’indirizzo dell’aggiornamento non è valido.");
        }
        return uri.toURL();
    }

    Map<String, Object> values() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("applicationId", "it.onda.player"); out.put("versionCode", versionCode);
        out.put("versionName", versionName); out.put("minSdk", minSdk);
        out.put("sizeBytes", sizeBytes); out.put("apkUrl", apkUrl); out.put("sha256", sha256);
        return out;
    }
}
