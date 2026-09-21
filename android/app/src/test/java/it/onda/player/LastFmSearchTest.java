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
        assertThrows(IOException.class,()->search.search("","",1,"a".repeat(32)));
        assertThrows(IOException.class,()->search.search("Song","",0,"a".repeat(32)));
        assertThrows(IOException.class,()->search.search("Song","",1,""));
        assertThrows(IOException.class,()->search.artistTracks("",1,"a".repeat(32)));
        assertThrows(IOException.class,()->search.search("","Artist",1,""));
    }
    @Test public void artistsAreDeduplicatedAndPaginatedWithoutRequiringATitle() throws Exception {
        JSONArray input=new JSONArray().put(new JSONObject().put("name","Imagine Dragons"))
            .put(new JSONObject().put("name","Imagine Dragons")).put(new JSONObject().put("name"," "));
        JSONObject raw=new JSONObject().put("results",new JSONObject().put("artistmatches",new JSONObject().put("artist",input)).put("opensearch:totalResults","21"));
        JSONObject result=LastFmSearch.artistResults(raw,1);
        assertEquals("artists",result.getString("kind"));
        assertEquals(1,result.getJSONArray("artists").length());
        assertEquals("Imagine Dragons",result.getJSONArray("artists").getJSONObject(0).getString("name"));
        assertTrue(result.getBoolean("hasMore"));
        assertFalse(LastFmSearch.artistResults(raw,2).getBoolean("hasMore"));
    }
    @Test public void artistsHandleSingleAndEmptyResponses() throws Exception {
        JSONObject matches=new JSONObject().put("artist",new JSONObject().put("name","Cher"));
        JSONObject raw=new JSONObject().put("results",new JSONObject().put("artistmatches",matches));
        assertEquals(1,LastFmSearch.artistResults(raw,1).getJSONArray("artists").length());
        matches.put("artist",new JSONArray());
        assertEquals(0,LastFmSearch.artistResults(raw,1).getJSONArray("artists").length());
        assertThrows(IOException.class,()->LastFmSearch.artistResults(new JSONObject().put("error",29),1));
    }
    @Test public void artistTracksReadNestedArtistAndTotalCount() throws Exception {
        JSONObject song=track("Believer","https://www.last.fm/music/Imagine+Dragons/_/Believer")
            .put("artist",new JSONObject().put("name","Imagine Dragons"));
        JSONObject raw=new JSONObject().put("toptracks",new JSONObject().put("track",new JSONArray().put(song))
            .put("@attr",new JSONObject().put("total","41")));
        JSONObject result=LastFmSearch.topTracks(raw,1,"Imagine Dragons");
        assertEquals("tracks",result.getString("kind"));
        assertEquals("Imagine Dragons",result.getJSONArray("tracks").getJSONObject(0).getString("artist"));
        assertTrue(result.getBoolean("hasMore"));
        assertFalse(LastFmSearch.topTracks(raw,3,"Imagine Dragons").getBoolean("hasMore"));
        assertTrue(song.get("artist") instanceof JSONObject);
    }
    @Test public void artistTracksHandleMissingArtistSingleTrackEmptyAndErrors() throws Exception {
        JSONObject song=new JSONObject().put("name","Believe").put("url","https://www.last.fm/music/Cher/_/Believe");
        JSONObject top=new JSONObject().put("track",song), raw=new JSONObject().put("toptracks",top);
        assertEquals("Cher",LastFmSearch.topTracks(raw,1,"Cher").getJSONArray("tracks").getJSONObject(0).getString("artist"));
        top.put("track",new JSONArray());
        assertEquals(0,LastFmSearch.topTracks(raw,1,"Cher").getJSONArray("tracks").length());
        assertThrows(IOException.class,()->LastFmSearch.topTracks(new JSONObject(),1,"Cher"));
        assertThrows(IOException.class,()->LastFmSearch.topTracks(new JSONObject().put("error",10),1,"Cher"));
    }
    @Test public void titleSearchExcludesMatchesFoundOnlyInTheArtist() throws Exception {
        JSONArray input=new JSONArray()
            .put(track("the CuRe","https://www.last.fm/music/Olivia+Rodrigo/_/the+CuRe").put("artist","Olivia Rodrigo"))
            .put(track("Lovesong","https://www.last.fm/music/The+Cure/_/Lovesong").put("artist","The Cure"))
            .put(track("Lullaby","https://www.last.fm/music/The+Cure/_/Lullaby").put("artist","The Cure"))
            .put(track("The Cure (Live)","https://www.last.fm/music/Other/_/The+Cure+(Live)").put("artist","Other"));
        JSONObject result=LastFmSearch.trackResults(response(input,"100"),1,"the cure","");
        assertEquals(2,result.getJSONArray("tracks").length());
        assertEquals("Olivia Rodrigo",result.getJSONArray("tracks").getJSONObject(0).getString("artist"));
        assertEquals("The Cure (Live)",result.getJSONArray("tracks").getJSONObject(1).getString("title"));
        assertTrue(result.getBoolean("hasMore"));
    }
    @Test public void bothFieldsMustMatchTheirOwnMetadata() throws Exception {
        JSONArray input=new JSONArray()
            .put(track("The Cure","https://www.last.fm/music/Lady+Gaga/_/The+Cure").put("artist","Lady Gaga"))
            .put(track("The Cure","https://www.last.fm/music/Other/_/The+Cure").put("artist","Other"))
            .put(track("Other","https://www.last.fm/music/Lady+Gaga/_/Other").put("artist","Lady Gaga"));
        JSONArray result=LastFmSearch.trackResults(response(input,"3"),1,"the cure","lady gaga").getJSONArray("tracks");
        assertEquals(1,result.length());assertEquals("Lady Gaga",result.getJSONObject(0).getString("artist"));
    }
    @Test public void titleMatchingPreservesAccentsCasePunctuationAndPartialSearch() throws Exception {
        JSONArray input=new JSONArray().put(track("Cariño — Live","https://www.last.fm/music/The+Marias/_/Carino").put("artist","The Marías"));
        assertEquals(1,LastFmSearch.trackResults(response(input,"1"),1,"  CARINO   live ","marias").getJSONArray("tracks").length());
        assertEquals(1,LastFmSearch.trackResults(response(input,"1"),1,"cari","").getJSONArray("tracks").length());
        assertEquals(0,LastFmSearch.trackResults(response(input,"1"),1,"marias","").getJSONArray("tracks").length());
    }
    @Test public void emptyFilteredPagesKeepTheNextPageAvailable() throws Exception {
        JSONObject raw=response(new JSONArray().put(track("Lovesong","https://www.last.fm/music/The+Cure/_/Lovesong").put("artist","The Cure")),"21");
        JSONObject first=LastFmSearch.trackResults(raw,1,"the cure","");
        assertEquals(0,first.getJSONArray("tracks").length());assertTrue(first.getBoolean("hasMore"));
        assertFalse(LastFmSearch.trackResults(raw,2,"the cure","").getBoolean("hasMore"));
    }
}
