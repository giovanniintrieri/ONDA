package it.onda.player;

import java.util.HashMap;
import java.util.Map;

public final class UpdateReleaseCheck {
    private static Map<String, Object> valid() {
        Map<String, Object> value = new HashMap<>();
        value.put("applicationId", "it.onda.player"); value.put("versionCode", 3);
        value.put("versionName", "1.2.0"); value.put("minSdk", 26);
        value.put("sizeBytes", 1048576L);
        value.put("sha256", "a".repeat(64)); value.put("apkUrl", "https://example.com/onda.apk");
        return value;
    }
    private static void reject(String field, Object replacement) throws Exception {
        Map<String, Object> value = valid(); value.put(field, replacement);
        try { new UpdateRelease(value); } catch (Exception expected) { return; }
        throw new AssertionError("Accepted invalid " + field + ": " + replacement);
    }
    public static void main(String[] args) throws Exception {
        UpdateRelease good = new UpdateRelease(valid());
        if (good.versionCode != 3 || !new UpdateRelease(good.values()).sha256.equals(good.sha256)) throw new AssertionError("Round trip failed");
        reject("applicationId", "another.app"); reject("versionCode", 3.0); reject("versionCode", "3");
        reject("versionCode", 2147483648L); reject("versionCode", 0); reject("sizeBytes", 0L);
        reject("sizeBytes", UpdateRelease.MAX_APK_BYTES + 1); reject("minSdk", 25);
        reject("versionName", "../../evil"); reject("sha256", "not-a-hash"); reject("sha256", null);
        for (String url : new String[]{"http://example.com/a.apk", "file:///tmp/a.apk", "https://user:pass@example.com/a.apk", "https://example.com/a.apk#fragment", "https:///missing-host"}) reject("apkUrl", url);
        System.out.println("All update manifest checks passed");
    }
}
