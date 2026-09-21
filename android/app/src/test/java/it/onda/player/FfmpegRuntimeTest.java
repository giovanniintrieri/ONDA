package it.onda.player;

import org.junit.Test;
import java.io.File;
import static org.junit.Assert.*;

public class FfmpegRuntimeTest {
    @Test public void conversionCanResolveLibrariesInBothPackagesInUpstreamOrder() {
        ProcessBuilder process=new ProcessBuilder("ffmpeg");
        process.environment().put("LD_LIBRARY_PATH","/unrelated/host/libraries");
        File root=new File("private/no_backup"),cache=new File("private/cache");
        FfmpegRuntime.configure(process,root,cache);
        String[] paths=process.environment().get("LD_LIBRARY_PATH").split(java.util.regex.Pattern.quote(File.pathSeparator));
        assertArrayEquals(new String[]{new File(root,"youtubedl-android/packages/python/usr/lib").getAbsolutePath(),
            new File(root,"youtubedl-android/packages/ffmpeg/usr/lib").getAbsolutePath()},paths);
        assertEquals(cache.getAbsolutePath(),process.environment().get("TMPDIR"));
    }
    @Test public void linkerFailureIsActionableWithoutDisclosingPrivatePaths() {
        FfmpegRuntime.Errors errors=new FfmpegRuntime.Errors();
        errors.accept("CANNOT LINK EXECUTABLE \"/private/app/libffmpeg.so\": library \"libc++_shared.so\" not found: needed by /private/song.mp3");
        FfmpegRuntime.Failure failure=errors.failure(1,false);
        assertTrue(failure.engineFailure);
        assertEquals("FFMPEG_EXIT=1;MISSING_LIBRARY:libc++_shared.so",failure.diagnostic);
        assertTrue(failure.getMessage().contains("libc++_shared.so"));
        assertFalse(failure.getMessage().contains("private"));
    }
    @Test public void missingCryptoAndNativeSymbolsStopTheQueue() {
        FfmpegRuntime.Errors errors=new FfmpegRuntime.Errors();
        errors.accept("library \"libcrypto.so.3\" not found");
        assertEquals("FFMPEG_EXIT=1;MISSING_LIBRARY:libcrypto.so.3",errors.failure(1,false).diagnostic);
        errors=new FfmpegRuntime.Errors();errors.accept("cannot locate symbol \"private-symbol\" referenced by private-file");
        assertTrue(errors.failure(1,false).engineFailure);
        assertEquals("FFMPEG_EXIT=1;MISSING_SYMBOL",errors.failure(1,false).diagnostic);
    }
    @Test public void malformedAudioDoesNotStopOtherTracks() {
        FfmpegRuntime.Errors errors=new FfmpegRuntime.Errors();
        errors.accept("/private/music.webm: Invalid data found when processing input");
        FfmpegRuntime.Failure failure=errors.failure(1,false);
        assertFalse(failure.engineFailure);assertEquals("FFMPEG_EXIT=1;INVALID_AUDIO",failure.diagnostic);
    }
    @Test public void arbitraryStderrAndUrlsNeverReachTheDiagnostics() {
        FfmpegRuntime.Errors errors=new FfmpegRuntime.Errors();
        for(int i=0;i<10000;i++)errors.accept("secret https://host/song?api_key=SECRET /private/user-file");
        FfmpegRuntime.Failure failure=errors.failure(42,false);
        assertEquals("FFMPEG_EXIT=42;PROCESS_FAILED",failure.diagnostic);
        assertEquals("Conversione MP3 non riuscita (FFmpeg 42)",failure.getMessage());
        assertFalse(failure.engineFailure);
        assertTrue(errors.failure(42,true).engineFailure);
    }
    @Test public void missingEncoderAndBadNativeFormatAreGlobalFailures() {
        for(String line:new String[]{"Unknown encoder 'libmp3lame'","invalid ELF header","unsupported page size","Unrecognized option 'write_id3v1'"}) {
            FfmpegRuntime.Errors errors=new FfmpegRuntime.Errors();errors.accept(line);
            assertTrue(line,errors.failure(1,false).engineFailure);
        }
    }
    @Test public void nativeCrashStopsTheQueueEvenWithoutStderr() {
        FfmpegRuntime.Failure failure=new FfmpegRuntime.Errors().failure(139,false);
        assertTrue(failure.engineFailure);
        assertEquals("FFMPEG_EXIT=139;NATIVE_CRASH",failure.diagnostic);
    }
    @Test public void libraryPathsAreNotAcceptedAsPublicLibraryNames() {
        FfmpegRuntime.Errors errors=new FfmpegRuntime.Errors();
        errors.accept("CANNOT LINK EXECUTABLE: library \"/private/libsecret.so\" not found");
        assertEquals("FFMPEG_EXIT=1;NATIVE_LINK_ERROR",errors.failure(1,false).diagnostic);
    }
}
