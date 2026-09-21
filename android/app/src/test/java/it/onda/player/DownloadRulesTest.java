package it.onda.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class DownloadRulesTest {
    @Test public void acceptsCanonicalVideoAndShareLinks() {
        String expected="https://www.youtube.com/watch?v=AbcDef123_-";
        assertEquals(expected,DownloadRules.url("https://youtu.be/AbcDef123_-?si=shared",false));
        assertEquals(expected,DownloadRules.url("https://m.youtube.com/shorts/AbcDef123_-",false));
        assertEquals(expected,DownloadRules.url("https://music.youtube.com/watch?v=AbcDef123_-&list=PLabcdefghijklm",false));
    }
    @Test public void playlistRequiresExplicitChoiceAndKeepsOnlyListId() {
        assertEquals("https://www.youtube.com/playlist?list=PLabcdefghijklm",DownloadRules.url("https://www.youtube.com/watch?v=AbcDef123_-&list=PLabcdefghijklm&index=4",true));
    }
    @Test public void rejectsExternalHostsCredentialsDuplicateParametersAndCommandText() {
        for(String url:new String[]{"http://youtube.com/watch?v=AbcDef123_-","https://youtube.com.evil.test/watch?v=AbcDef123_-","https://youtube.com@evil.test/watch?v=AbcDef123_-","https://u@youtube.com/watch?v=AbcDef123_-","https://youtube.com:443/watch?v=AbcDef123_-","https://www.youtube.com/watch?v=AbcDef123_-&v=OtherId1234","--exec touch /tmp/test","file:///tmp/test","https://youtu.be/AbcDef123_-/extra","https://youtube.com/watch?v=%24%28id%29"}) {
            assertThrows(url,IllegalArgumentException.class,()->DownloadRules.url(url,false));
        }
    }
    @Test public void videoLinkWithoutPlaylistCannotDownloadAPlaylist() {
        assertThrows(IllegalArgumentException.class,()->DownloadRules.url("https://youtu.be/AbcDef123_-",true));
    }
    @Test public void filenamesNeverAddPlaylistNumberingOrPaths() {
        assertEquals("Cariño.mp3",DownloadRules.filename("Cariño"));
        assertEquals("A-B - C-D.mp3",DownloadRules.filename("A/B : C\\D"));
        assertEquals("_CON.mp3",DownloadRules.filename("CON"));
        assertEquals("Brano.mp3",DownloadRules.filename("..."));
        assertEquals(124,DownloadRules.filename(String.join("",java.util.Collections.nCopies(150,"a"))).length());
    }
    @Test public void onlySuccessfulEntriesAreSkippedOnResume() {
        assertTrue(DownloadRules.complete("added"));assertTrue(DownloadRules.complete("duplicate"));
        assertFalse(DownloadRules.complete("working"));assertFalse(DownloadRules.complete("pending"));assertFalse(DownloadRules.complete("failed"));
    }
    @Test public void cancellationIsVisibleAcrossWorkers() throws Exception {
        DownloadBackend.Cancellation token=new DownloadBackend.Cancellation();token.check();
        Thread worker=new Thread(token::cancel);worker.start();worker.join();
        assertThrows(java.io.IOException.class,token::check);
    }
}
