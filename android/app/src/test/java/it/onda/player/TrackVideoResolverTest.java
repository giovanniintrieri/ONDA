package it.onda.player;

import java.io.IOException;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class TrackVideoResolverTest {
    private static final String TRACK = "https://www.last.fm/music/Olivia+Rodrigo/_/tHe+CuRe";
    private static final String VIDEO = "https://www.youtube.com/watch?v=B402rKl4bUg";

    @Test public void apiVideoAvoidsTheBlockedLastFmPageEntirely() throws Exception {
        TrackVideoResolver resolver = new TrackVideoResolver((title, artist) -> {
            assertEquals("tHe CuRe", title); assertEquals("Olivia Rodrigo", artist);
            return AudioDbVideo.result(new JSONObject("{\"track\":[{\"strTrack\":\"the cure\",\"strArtist\":\"Olivia Rodrigo\",\"strMusicVid\":\"" + VIDEO + "\"}]}"), title, artist);
        }, url -> { fail("The Last.fm page must not be requested when the API returned the video"); return null; });
        JSONObject result = resolver.resolve(TRACK, "tHe CuRe", "Olivia Rodrigo");
        assertEquals(VIDEO, result.getString("url")); assertEquals("not_requested", result.getString("pageStatus"));
    }

    @Test public void missingApiVideoCanUseTheMatchingLastFmPage() throws Exception {
        TrackVideoResolver resolver = new TrackVideoResolver((title, artist) -> LastFmPage.result("not_found", "", "Nessun video API."),
            url -> { assertEquals(TRACK, url); return LastFmPage.result("found", VIDEO, "Video dalla pagina."); });
        JSONObject result = resolver.resolve(TRACK, "tHe CuRe", "Olivia Rodrigo");
        assertEquals(VIDEO, result.getString("url")); assertEquals("Last.fm", result.getString("source"));
        assertEquals("not_found", result.getString("apiStatus"));
    }

    @Test public void apiFailureStillAllowsThePageWithoutExposingProviderDetails() throws Exception {
        TrackVideoResolver resolver = new TrackVideoResolver((title, artist) -> { throw new IOException("private-provider-response"); },
            url -> LastFmPage.result("found", VIDEO, "Video dalla pagina."));
        JSONObject result = resolver.resolve(TRACK, "tHe CuRe", "Olivia Rodrigo");
        assertEquals(VIDEO, result.getString("url")); assertEquals("unavailable", result.getString("apiStatus"));
        assertFalse(result.toString().contains("private-provider-response"));
    }

    @Test public void missingApiVideoAndVerificationRemainSeparateDiagnostics() throws Exception {
        TrackVideoResolver resolver = new TrackVideoResolver((title, artist) -> LastFmPage.result("not_found", "", "Nessun video API."),
            url -> LastFmPage.result("verification", "", "Last.fm richiede una verifica."));
        JSONObject result = resolver.resolve(TRACK, "tHe CuRe", "Olivia Rodrigo");
        assertEquals("", result.getString("url")); assertEquals("not_found", result.getString("apiStatus"));
        assertEquals("verification", result.getString("pageStatus"));
        assertTrue(result.getString("message").contains("API")); assertTrue(result.getString("message").contains("verifica"));
    }

    @Test public void bothProviderFailuresReturnUsefulStatusWithoutBodies() throws Exception {
        TrackVideoResolver resolver = new TrackVideoResolver((title, artist) -> { throw new IOException("private-api"); },
            url -> { throw new IOException("private-page"); });
        JSONObject result = resolver.resolve(TRACK, "tHe CuRe", "Olivia Rodrigo");
        assertEquals("unavailable", result.getString("status")); assertEquals("", result.getString("url"));
        assertFalse(result.toString().contains("private-"));
    }

    @Test public void incompleteSelectionAndExternalPageFailBeforeEitherProvider() {
        TrackVideoResolver resolver = new TrackVideoResolver((title, artist) -> { fail("No API request expected"); return null; },
            url -> { fail("No page request expected"); return null; });
        assertThrows(IOException.class, () -> resolver.resolve(TRACK, "", "Olivia Rodrigo"));
        assertThrows(IOException.class, () -> resolver.resolve(TRACK, "The Cure", ""));
        assertThrows(IOException.class, () -> resolver.resolve("https://evil.test/music/A/_/B", "The Cure", "Olivia Rodrigo"));
    }
}
