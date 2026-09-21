package it.onda.player;

import org.json.*;
import org.junit.Test;
import java.io.IOException;
import java.util.*;
import static org.junit.Assert.*;

public class DownloadMetadataTest {
    private JSONObject video() throws Exception {return new JSONObject().put("title","Artist - Song (Official Music Video)").put("duration",180);}
    private JSONObject match() throws Exception {return new JSONObject("{\"track\":{\"name\":\"Song\",\"artist\":{\"name\":\"Artist\"},\"duration\":\"180000\",\"album\":{\"title\":\"Album\"},\"toptags\":{\"tag\":[{\"name\":\"Rock\"},{\"name\":\"Italian\"}]}}}");}
    @Test public void noKeyKeepsYoutubeAndCleansOnlyDecorations() throws Exception {
        DownloadMetadata.Resolved result=DownloadMetadata.resolve(video(),null);
        assertEquals("Song",result.tags.getString("title"));assertEquals("Artist",result.tags.getString("artist"));
    }
    @Test public void structuredFieldsWin() throws Exception {
        JSONObject info=video().put("track","Title").put("artists",new JSONArray().put("One").put("Two")).put("album","Album").put("genre","Rock");
        JSONObject tags=DownloadMetadata.fallback(info);
        assertEquals("Title",tags.getString("title"));assertEquals("One; Two",tags.getString("artist"));assertEquals("Album",tags.getString("album"));
    }
    @Test public void uploaderCanChooseOrientationButCannotInventArtist() throws Exception {
        JSONObject reversed=new JSONObject().put("title","Song - Artist").put("channel","Artist - Topic");
        assertEquals("Song",DownloadMetadata.fallback(reversed).getString("title"));
        assertEquals("Artist",DownloadMetadata.fallback(reversed).getString("artist"));
        assertEquals("",DownloadMetadata.fallback(new JSONObject().put("title","Song").put("channel","Label")).getString("artist"));
    }
    @Test public void specialVersionsNeverBecomeTheStudioVersion() throws Exception {
        for(String suffix:new String[]{" (Live)"," (Remix)"," - Acoustic"," (Sped Up)"," (Remastered 2024)"}) {
            JSONObject info=video().put("title","Artist - Song"+suffix);
            DownloadMetadata.Resolved result=DownloadMetadata.resolve(info,(m,a,t)->{fail("Should not query a different version");return null;});
            assertTrue(result.tags.getString("title").contains(suffix));
        }
    }
    @Test public void allTagsAreKeptDeduplicatedAndSemicolonSeparated() throws Exception {
        List<String> calls=new ArrayList<>();
        DownloadMetadata.Resolved result=DownloadMetadata.resolve(video(),(method,artist,title)->{
            calls.add(method);
            return method.equals("track.getInfo")?match():new JSONObject("{\"toptags\":{\"@attr\":{\"artist\":\"Artist\",\"track\":\"Song\"},\"tag\":[{\"name\":\"rock\"},{\"name\":\"Favourites\"},{\"name\":\"1990s\"}]}}");
        });
        assertEquals(Arrays.asList("track.getInfo","track.getTopTags"),calls);
        assertEquals("Rock; Italian; Favourites; 1990s",result.tags.getString("genre"));assertEquals("Album",result.tags.getString("album"));
    }
    @Test public void artistTagsAreFallbackWhenTrackHasNone() throws Exception {
        List<String> calls=new ArrayList<>();
        DownloadMetadata.Resolved result=DownloadMetadata.resolve(video(),(method,artist,title)->{
            calls.add(method);
            if(method.equals("track.getInfo")){JSONObject result1=match();result1.getJSONObject("track").remove("toptags");return result1;}
            return new JSONObject("{\"toptags\":{\"tag\":{\"name\":\"Pop\"}}}");
        });
        assertEquals("artist.getTopTags",calls.get(1));assertEquals("Pop",result.tags.getString("genre"));
    }
    @Test public void wrongOwnerAndDurationCannotOverwriteMetadata() throws Exception {
        for(String field:new String[]{"name","artist","duration"}) {
            DownloadMetadata.Resolved result=DownloadMetadata.resolve(video(),(method,artist,title)->{
                JSONObject response=match();JSONObject track=response.getJSONObject("track");
                track.put(field,field.equals("artist")?new JSONObject().put("name","Other"):field.equals("duration")?"240000":"Other");return response;
            });
            assertEquals("",result.tags.getString("album"));assertEquals("Song",result.tags.getString("title"));
        }
    }
    @Test public void foreignTagResponseIsIgnored() throws Exception {
        DownloadMetadata.Resolved result=DownloadMetadata.resolve(video(),(method,artist,title)->method.equals("track.getInfo")?match():new JSONObject("{\"toptags\":{\"@attr\":{\"artist\":\"Other\"},\"tag\":[{\"name\":\"Wrong\"}]}}"));
        assertEquals("Rock; Italian",result.tags.getString("genre"));
    }
    @Test public void networkFailureStillReturnsUsableMetadata() throws Exception {
        DownloadMetadata.Resolved first=DownloadMetadata.resolve(video(),(m,a,t)->{throw new IOException("upstream URL with key");});
        assertEquals("Song",first.tags.getString("title"));assertFalse(first.note.contains("key"));
        DownloadMetadata.Resolved second=DownloadMetadata.resolve(video(),(m,a,t)->{if(m.equals("track.getInfo"))return match();throw new IOException();});
        assertEquals("Album",second.tags.getString("album"));assertEquals("Rock; Italian",second.tags.getString("genre"));
    }
}
