package it.onda.player;

import java.net.URI;
import java.net.URLDecoder;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONObject;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

/** A successful HTTP response can contain a verification page instead of the requested track. */
final class LastFmPage {
    private LastFmPage() {}

    static boolean sameTrack(String first, String second) {
        try {
            String a = new URI(LastFmSearch.trackUrl(first)).getRawPath();
            String b = new URI(LastFmSearch.trackUrl(second)).getRawPath();
            return URLDecoder.decode(a, "UTF-8").replaceAll("/+$", "").equalsIgnoreCase(URLDecoder.decode(b, "UTF-8").replaceAll("/+$", ""));
        } catch (Exception e) { return false; }
    }

    static String youtube(String url) {
        try {
            // Old page markup can use an HTTP or protocol-relative link; the download always uses HTTPS.
            if (url.startsWith("//")) url = "https:" + url;
            if (url.startsWith("http://")) url = "https://" + url.substring(7);
            return DownloadRules.url(url, false);
        } catch (Exception e) { return ""; }
    }

    static boolean browserPage(String original, String candidate) {
        try {
            URI uri = new URI(candidate);
            if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1
                || !("www.last.fm".equals(uri.getHost()) || "last.fm".equals(uri.getHost()))) return false;
            // Browser verification may add a query/fragment; it must stay on this track's path.
            return sameTrack(original, "https://www.last.fm" + uri.getRawPath());
        } catch (Exception e) { return false; }
    }

    private static boolean verification(Document page) {
        String title = page.title().trim().toLowerCase(Locale.ROOT);
        return title.equals("client challenge") || title.equals("just a moment...") || title.equals("just a moment…")
            || !page.select("script[src*='/_fs-ch-'], link[href*='/_fs-ch-'], #challenge-form, #cf-challenge-running").isEmpty();
    }

    private static String video(Document page, String trackUrl) {
        Set<String> videos = new LinkedHashSet<>();
        for (Element element : page.select(".header-new-playlink, .header-new-playlink [href], .header-new-playlink [data-youtube-url], [data-track-url][data-youtube-url]")) {
            boolean main = element.hasClass("header-new-playlink") || element.parents().stream().anyMatch(parent -> parent.hasClass("header-new-playlink"));
            if (!main && !sameTrack(trackUrl, element.absUrl("data-track-url"))) continue;
            for (String attribute : new String[]{"href", "data-youtube-url"}) {
                String url = youtube(element.attr(attribute));
                if (!url.isEmpty()) videos.add(url);
            }
        }
        // Repeated controls are fine; disagreeing main-track controls require a user's choice.
        return videos.size() == 1 ? videos.iterator().next() : "";
    }

    static JSONObject inspect(String html, String trackUrl) throws Exception {
        Document page = Jsoup.parse(html, trackUrl);
        if (verification(page)) return result("verification", "", "Last.fm richiede una verifica prima di mostrare la pagina. Apri il brano in Onda per completarla e recuperare il collegamento.");
        String video = video(page, trackUrl);
        if (!video.isEmpty()) return result("found", video, "Collegamento YouTube trovato sulla pagina Last.fm.");
        Element canonical = page.selectFirst("link[rel=canonical][href]");
        boolean trackPage = canonical != null && sameTrack(trackUrl, canonical.absUrl("href")) && page.selectFirst("h1") != null;
        return trackPage
            ? result("not_found", "", "La pagina è stata letta, ma il collegamento del brano non è stato riconosciuto. Aprila in Onda e tocca il suo video.")
            : result("unrecognized", "", "La risposta ricevuta non è la pagina del brano attesa. Apri il brano in Onda per leggere il collegamento dal sito.");
    }

    static JSONObject result(String status, String url, String message) throws Exception {
        return new JSONObject().put("status", status).put("url", url).put("message", message);
    }
}
