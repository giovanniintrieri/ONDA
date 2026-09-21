package it.onda.player;

import org.json.*;
import java.io.File;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

/** The queue and UI depend on this contract. A future server implements the same operations. */
public interface DownloadBackend {
    interface Progress { void update(String stage, int percent); }
    final class Cancellation {
        private final AtomicBoolean cancelled = new AtomicBoolean();
        public void cancel() { cancelled.set(true); }
        public boolean cancelled() { return cancelled.get(); }
        public void check() throws IOException { if (cancelled()) throw new IOException("Download annullato"); }
    }
    void prepare(Cancellation cancellation) throws Exception;
    JSONArray inspect(String url, boolean playlist, Cancellation cancellation) throws Exception;
    Result download(JSONObject entry, File directory, String lastFmKey, Cancellation cancellation, Progress progress) throws Exception;
    final class Result {
        public final File file;
        public final JSONObject metadata;
        public final String note;
        public Result(File file, JSONObject metadata, String note) { this.file = file; this.metadata = metadata; this.note = note; }
    }
}
