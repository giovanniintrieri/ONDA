package it.onda.player;

import java.io.IOException;
import org.json.JSONObject;

/** Resolve the selected track from structured API data before trying its Last.fm page. */
final class TrackVideoResolver {
    interface Api { JSONObject find(String title, String artist) throws Exception; }
    interface Page { JSONObject find(String url) throws Exception; }
    private final Api api;
    private final Page page;

    TrackVideoResolver(Api api, Page page) { this.api = api; this.page = page; }

    JSONObject resolve(String url, String title, String artist) throws Exception {
        String canonical = LastFmSearch.trackUrl(url);
        title = DownloadRules.text(title); artist = DownloadRules.text(artist);
        if (title.isEmpty() || artist.isEmpty()) throw new IOException("Dati del brano incompleti. Ripeti la ricerca e selezionalo di nuovo.");
        JSONObject apiResult;
        try { apiResult = api.find(title, artist); }
        catch (Exception e) { apiResult = LastFmPage.result("unavailable", "", "TheAudioDB non è disponibile in questo momento."); }
        if (!apiResult.optString("url").isEmpty()) return apiResult.put("apiStatus", "found").put("pageStatus", "not_requested");
        if (Thread.currentThread().isInterrupted()) throw new IOException("Ricerca del video annullata");
        JSONObject pageResult;
        try { pageResult = page.find(canonical); }
        catch (Exception e) { pageResult = LastFmPage.result("unavailable", "", "La pagina Last.fm non è stata letta. Puoi riprovare o aprire il brano in Onda."); }
        pageResult.put("apiStatus", apiResult.optString("status")).put("pageStatus", pageResult.optString("status"));
        if (!pageResult.optString("url").isEmpty()) return pageResult.put("source", "Last.fm");
        return pageResult.put("message", apiResult.optString("message") + " " + pageResult.optString("message"));
    }
}
