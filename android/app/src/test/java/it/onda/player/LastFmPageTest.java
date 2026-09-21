package it.onda.player;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class LastFmPageTest {
    private static final String TRACK = "https://www.last.fm/music/Olivia+Rodrigo/_/tHe+CuRe";
    private static final String VIDEO = "https://www.youtube.com/watch?v=7wtfhZwyrcc";
    private static final String OTHER = "https://www.last.fm/music/The+Cure/_/Lovesong";

    private JSONObject inspect(String html) throws Exception { return LastFmPage.inspect(html, TRACK); }

    @Test public void http200ChallengeIsNotAClaimThatTheVideoIsMissing() throws Exception {
        // Markers observed in the HTTP 200 response for the user's selected track.
        for (String html : new String[]{
            "<title>Client Challenge</title><noscript>Please enable JavaScript</noscript>",
            "<script src='/_fs-ch-1T1wmsGaOgGaSxcX/script.js'></script>",
            "<link rel='stylesheet' href='/_fs-ch-example/style.css'>",
            "<title>Just a moment...</title><div id='challenge-form'></div>"
        }) {
            JSONObject result = inspect(html);
            assertEquals("verification", result.getString("status"));
            assertEquals("", result.getString("url"));
            assertTrue(result.getString("message").contains("verifica"));
        }
    }

    @Test public void readsMainHrefDataAttributeAndNestedControls() throws Exception {
        for (String html : new String[]{
            "<a class='header-new-playlink' href='" + VIDEO + "&amp;list=PLabcdefghijklm'>Play</a>",
            "<button class='header-new-playlink' data-youtube-url='" + VIDEO + "'>Play</button>",
            "<div class='header-new-playlink'><a href='//youtu.be/7wtfhZwyrcc'>Play</a></div>",
            "<a class='header-new-playlink' href='http://www.youtube.com/watch?v=7wtfhZwyrcc'>Play</a>"
        }) {
            JSONObject result = inspect(html);
            assertEquals("found", result.getString("status"));
            assertEquals(VIDEO, result.getString("url"));
        }
    }

    @Test public void usesMatchingTrackDataButNeverSimilarTracks() throws Exception {
        String similar = "<a data-track-url='" + OTHER + "' data-youtube-url='https://youtu.be/WrongId1234'>Similar</a>";
        String matching = "<button data-track-url='https://www.last.fm/music/Olivia%20Rodrigo/_/the%20cure' data-youtube-url='" + VIDEO + "'>Play</button>";
        assertEquals(VIDEO, inspect(similar + matching).getString("url"));
        assertEquals(VIDEO, inspect(matching.replace("https://www.last.fm/music/", "/music/")).getString("url"));
        assertEquals(VIDEO, inspect("<a class='header-new-playlink' href='" + VIDEO + "'>Play</a>" + similar).getString("url"));
        assertEquals("", inspect(similar).getString("url"));
    }

    @Test public void repeatedMainLinksAreFineButDisagreeingLinksNeedAChoice() throws Exception {
        String main = "<a class='header-new-playlink' href='" + VIDEO + "'>Play</a>";
        assertEquals(VIDEO, inspect(main + main).getString("url"));
        assertEquals("", inspect(main + "<a class='header-new-playlink' href='https://youtu.be/WrongId1234'>Play</a>").getString("url"));
    }

    @Test public void recognizesATrackPageSeparatelyFromAnUnexpectedResponse() throws Exception {
        assertEquals("not_found", inspect("<link rel='canonical' href='" + TRACK + "'><h1>tHe CuRe</h1>").getString("status"));
        assertEquals("unrecognized", inspect("<h1>Service unavailable</h1>").getString("status"));
        assertEquals("unrecognized", inspect("<link rel='canonical' href='" + OTHER + "'><h1>Lovesong</h1>").getString("status"));
    }

    @Test public void browserStaysOnTheSameTrackAllowingVerificationQueryAndCanonicalCase() {
        assertTrue(LastFmPage.browserPage(TRACK, TRACK + "?verification=example#video"));
        assertTrue(LastFmPage.browserPage(TRACK, "https://last.fm/music/Olivia%20Rodrigo/_/the%20cure/"));
        for (String url : new String[]{OTHER, "https://www.last.fm/login", "https://last.fm.evil.test/music/Olivia+Rodrigo/_/tHe+CuRe",
            "https://user@www.last.fm/music/Olivia+Rodrigo/_/tHe+CuRe", "https://www.last.fm:443/music/Olivia+Rodrigo/_/tHe+CuRe",
            "http://www.last.fm/music/Olivia+Rodrigo/_/tHe+CuRe", "file:///music/Olivia+Rodrigo/_/tHe+CuRe", null})
            assertFalse(url, LastFmPage.browserPage(TRACK, url));
    }

    @Test public void pageCannotSupplyUnsafeVideoUrls() throws Exception {
        for (String url : new String[]{"https://www.youtube.com.evil.test/watch?v=7wtfhZwyrcc", "https://user@www.youtube.com/watch?v=7wtfhZwyrcc",
            "javascript:alert(1)", "file:///watch?v=7wtfhZwyrcc", "https://youtu.be/short"})
            assertEquals("", inspect("<a class='header-new-playlink' href='" + url + "'>Play</a>").getString("url"));
    }
}
