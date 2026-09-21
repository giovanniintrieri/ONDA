package it.onda.player;

import java.io.IOException;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class AudioDbVideoTest {
    private JSONObject track(String title, String artist, Object video) throws Exception {
        return new JSONObject().put("strTrack", title).put("strArtist", artist).put("strMusicVid", video);
    }
    private JSONObject response(JSONObject... tracks) throws Exception {
        JSONArray list = new JSONArray(); for (JSONObject track : tracks) list.put(track);
        return new JSONObject().put("track", list);
    }

    @Test public void readsTheVideoFromTheUsersOriginalApiResponse() throws Exception {
        JSONObject raw = response(track("Lonely Day", "System of a Down", "https://www.youtube.com/watch?v=DnGdoEa1tPg"));
        JSONObject result = AudioDbVideo.result(raw, "Lonely Day", "System of a Down");
        assertEquals("https://www.youtube.com/watch?v=DnGdoEa1tPg", result.getString("url"));
        assertEquals("TheAudioDB", result.getString("source"));
        assertEquals("found", result.getString("status"));
    }

    @Test public void readsTheCureFromTheLiveApiResponseIgnoringCase() throws Exception {
        JSONObject raw = response(track("the cure", "Olivia Rodrigo", "https://www.youtube.com/watch?v=B402rKl4bUg"));
        assertEquals("https://www.youtube.com/watch?v=B402rKl4bUg", AudioDbVideo.result(raw, "tHe CuRe", "Olivia Rodrigo").getString("url"));
    }

    @Test public void requiresBothTitleAndArtistAndPreservesVersionNames() throws Exception {
        JSONObject raw = response(track("The Cure", "Lady Gaga", "https://youtu.be/DnGdoEa1tPg"),
            track("The Cure (Live)", "Olivia Rodrigo", "https://youtu.be/DnGdoEa1tPg"),
            track("Another song", "Olivia Rodrigo", "https://youtu.be/DnGdoEa1tPg"));
        assertEquals("", AudioDbVideo.result(raw, "The Cure", "Olivia Rodrigo").getString("url"));
        assertEquals("", AudioDbVideo.result(raw, "Cure", "Lady Gaga").getString("url"));
    }

    @Test public void normalizesAccentsPunctuationAndRepeatedVideoLinks() throws Exception {
        JSONObject raw = response(track("Cariño", "The Marías", "https://youtu.be/DnGdoEa1tPg"),
            track("Cariño", "The Marías", "http://www.youtube.com/watch?v=DnGdoEa1tPg&list=PLabcdefghijklm"));
        assertEquals("https://www.youtube.com/watch?v=DnGdoEa1tPg", AudioDbVideo.result(raw, " CARINO! ", "THE MARIAS").getString("url"));
    }

    @Test public void doesNotChooseArbitrarilyBetweenDifferentVideos() throws Exception {
        JSONObject raw = response(track("The Cure", "Olivia Rodrigo", "https://youtu.be/DnGdoEa1tPg"),
            track("The Cure", "Olivia Rodrigo", "https://youtu.be/B402rKl4bUg"));
        JSONObject result = AudioDbVideo.result(raw, "The Cure", "Olivia Rodrigo");
        assertEquals("ambiguous", result.getString("status")); assertEquals("", result.getString("url"));
    }

    @Test public void emptyCatalogAndMissingVideosAreDistinctFromMalformedResponses() throws Exception {
        for (JSONObject raw : new JSONObject[]{new JSONObject().put("track", JSONObject.NULL), response(),
            response(track("Lonely Day", "System of a Down", JSONObject.NULL))})
            assertEquals("not_found", AudioDbVideo.result(raw, "Lonely Day", "System of a Down").getString("status"));
        for (JSONObject raw : new JSONObject[]{new JSONObject().put("error", "upstream-details"), new JSONObject().put("track", "invalid")}) {
            IOException error = assertThrows(IOException.class, () -> AudioDbVideo.result(raw, "Song", "Artist"));
            assertFalse(error.getMessage().contains("upstream-details"));
        }
    }

    @Test public void rejectsUnsafeAndNonVideoLinks() throws Exception {
        for (String link : new String[]{"https://youtube.com.evil.test/watch?v=DnGdoEa1tPg", "javascript:alert(1)",
            "https://user@www.youtube.com/watch?v=DnGdoEa1tPg", "https://www.youtube.com/playlist?list=PLabcdefghijklm"})
            assertEquals("", AudioDbVideo.result(response(track("Song", "Artist", link)), "Song", "Artist").getString("url"));
    }

    @Test public void encodesBothFieldsAndRejectsMissingMetadataBeforeNetwork() throws Exception {
        assertEquals("https://www.theaudiodb.com/api/v1/json/123/searchtrack.php?s=A%26B&t=Cari%C3%B1o+%26+%3Ft%3DOther",
            AudioDbVideo.searchUrl("Cariño & ?t=Other", "A&B"));
        AudioDbVideo api = new AudioDbVideo();
        assertThrows(IOException.class, () -> api.find("", "Artist"));
        assertThrows(IOException.class, () -> api.find("Song", ""));
    }
}
