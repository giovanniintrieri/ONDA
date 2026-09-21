package it.onda.player;

import org.json.*;
import org.junit.Test;
import java.io.IOException;
import static org.junit.Assert.*;

public class LastFmSearchTest {
    private JSONObject track(String title, String url) throws Exception {
        return new JSONObject().put("name",title).put("artist","Imagine Dragons").put("url",url);
    }
    private JSONObject response(Object tracks, String total) throws Exception {
        return new JSONObject().put("results",new JSONObject().put("trackmatches",new JSONObject().put("track",tracks)).put("opensearch:totalResults",total));
    }
    @Test public void searchNormalizesDeduplicatesAndRejectsExternalPages() throws Exception {
        JSONObject good=track("Believer","http://www.last.fm/music/Imagine+Dragons/_/Believer");
        JSONArray tracks=new JSONArray().put(good).put(good).put(track("Wrong","https://evil.test/music/A/_/B"));
        JSONObject result=LastFmSearch.results(response(tracks,"42"),1);
        assertEquals(1,result.getJSONArray("tracks").length());
        assertEquals("https://www.last.fm/music/Imagine+Dragons/_/Believer",result.getJSONArray("tracks").getJSONObject(0).getString("url"));
        assertTrue(result.getBoolean("hasMore"));
        assertFalse(LastFmSearch.results(response(tracks,"42"),3).getBoolean("hasMore"));
    }
    @Test public void handlesEmptyAndSingleTrackResponses() throws Exception {
        assertEquals(0,LastFmSearch.results(response(new JSONArray(),"0"),1).getJSONArray("tracks").length());
        assertEquals(1,LastFmSearch.results(response(track("Cariño","https://last.fm/music/The+Mar%C3%ADas/_/Cari%C3%B1o"),"1"),1).getJSONArray("tracks").length());
    }
    @Test public void upstreamErrorsAreUsefulAndDoNotExposeTheBody() throws Exception {
        for(int code:new int[]{10,26,29,8}) {
            JSONObject raw=new JSONObject().put("error",code).put("message","private-key-and-url");
            IOException error=assertThrows(IOException.class,()->LastFmSearch.results(raw,1));
            assertFalse(error.getMessage().contains("private"));
            assertTrue(error.getMessage().contains("Last.fm"));
        }
        assertThrows(IOException.class,()->LastFmSearch.results(new JSONObject(),1));
    }
    @Test public void rejectsOffsiteCredentialsPortsAndTraversal() {
        for(String url:new String[]{"https://last.fm.evil.test/music/A/_/B","https://user@www.last.fm/music/A/_/B","https://www.last.fm:443/music/A/_/B","file:///music/A/_/B","https://www.last.fm/music/A/_/B?next=https://evil.test","https://www.last.fm/music/%2e%2e/_/B","https://www.last.fm/music/A/_/%2f..","https://www.last.fm/music/A/_/%0a","https://www.last.fm/music/A/_/B#x"})
            assertThrows(url,IOException.class,()->LastFmSearch.trackUrl(url));
    }
    @Test public void readsOnlyTheMainTrackLinkRegardlessOfAttributeOrder() throws Exception {
        String html="<a href='https://youtu.be/WrongId1234'>Similar song</a><a href='https://www.youtube.com/watch?v=7wtfhZwyrcc&amp;list=PLabcdefghijklm' class='extra header-new-playlink'>Play</a>";
        assertEquals("https://www.youtube.com/watch?v=7wtfhZwyrcc",LastFmSearch.videoFromPage(html));
    }
    @Test public void missingOrBlockedMainLinkNeverSelectsASimilarTrack() throws Exception {
        for(String html:new String[]{"<html>Verify you are human</html>","<a data-youtube-url='https://youtu.be/WrongId1234'>Similar</a>","<a class='header-new-playlink' href='https://evil.test/watch?v=7wtfhZwyrcc'>Play</a>"})
            assertEquals("",LastFmSearch.videoFromPage(html));
    }
    @Test public void invalidInputFailsBeforeNetworkAccess() {
        LastFmSearch search=new LastFmSearch();
        assertThrows(IOException.class,()->search.search("","Artist",1,"a".repeat(32)));
        assertThrows(IOException.class,()->search.search("Song","",0,"a".repeat(32)));
        assertThrows(IOException.class,()->search.search("Song","",1,""));
    }
}
