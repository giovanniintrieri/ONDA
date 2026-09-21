package it.onda.player;

import java.text.Normalizer;
import java.util.*;

/** Pure rules shared by validation and JVM tests; never guesses from a filename. */
public final class DuplicateRules {
    private DuplicateRules() {}
    public static String text(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKC).trim().replaceAll("(?U)\\s+", " ").toLowerCase(Locale.ROOT);
    }
    public static boolean matches(String title, String artist, double duration, String otherTitle, String otherArtist, double otherDuration) {
        String a = text(artist), t = text(title);
        return !t.isEmpty() && !a.isEmpty() && !a.equals("artista sconosciuto") && !a.equals("unknown artist")
            && t.equals(text(otherTitle)) && a.equals(text(otherArtist))
            && Double.isFinite(duration) && Double.isFinite(otherDuration) && duration > 0 && otherDuration > 0
            && Math.abs(duration - otherDuration) <= 2;
    }
    public static List<String> replace(List<String> ids, Set<String> removed, String keep) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (String id : ids) result.add(removed.contains(id) ? keep : id);
        return new ArrayList<>(result);
    }
}
