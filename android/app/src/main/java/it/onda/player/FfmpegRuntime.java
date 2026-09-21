package it.onda.player;

import java.io.File;
import java.io.IOException;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Shared by the startup check and conversion; independent of Android for regression tests. */
final class FfmpegRuntime {
    private FfmpegRuntime() {}
    static void configure(ProcessBuilder process, File noBackupDirectory, File cacheDirectory) {
        File packages = new File(noBackupDirectory, "youtubedl-android/packages");
        // FFmpeg also links libraries shipped in the Python package (C++, crypto, expat, ...).
        // Match YoutubeDL's search order so common SONAMEs resolve to the same versions.
        process.environment().put("LD_LIBRARY_PATH", new File(packages,"python/usr/lib").getAbsolutePath()
            + File.pathSeparator + new File(packages,"ffmpeg/usr/lib").getAbsolutePath());
        process.environment().put("TMPDIR", cacheDirectory.getAbsolutePath());
    }
    static final class Failure extends IOException {
        final String diagnostic;
        final boolean engineFailure;
        Failure(String message, String diagnostic, boolean engineFailure) {
            super(message); this.diagnostic=diagnostic; this.engineFailure=engineFailure;
        }
    }
    /** Keep only recognized categories, never upstream URLs, paths, titles or arbitrary stderr. */
    static final class Errors {
        private static final Pattern MISSING_LIBRARY = Pattern.compile("library [\"']([A-Za-z0-9_+.-]{1,120}\\.so(?:\\.[0-9]+)*)[\"'] not found",Pattern.CASE_INSENSITIVE);
        private String code="PROCESS_FAILED", message="Conversione MP3 non riuscita";
        private boolean engine;
        void accept(String line) {
            if(engine)return;
            String lower=line.toLowerCase(Locale.ROOT);
            Matcher missing=MISSING_LIBRARY.matcher(line);
            if(missing.find()) {
                code="MISSING_LIBRARY:"+missing.group(1);message="Motore MP3 non disponibile: manca "+missing.group(1);engine=true;
            }else if(lower.contains("cannot locate symbol")) {
                code="MISSING_SYMBOL";message="Le librerie del convertitore MP3 non sono compatibili";engine=true;
            }else if(lower.contains("cannot link executable") || lower.contains("bad elf") || lower.contains("invalid elf") || lower.contains("page size") || lower.contains("not page-aligned")) {
                code="NATIVE_LINK_ERROR";message="Il convertitore MP3 non riesce ad avviarsi su questo dispositivo";engine=true;
            }else if(lower.contains("unknown encoder") && lower.contains("libmp3lame")) {
                code="MP3_ENCODER_MISSING";message="Il motore non dispone del convertitore MP3";engine=true;
            }else if(lower.contains("unrecognized option") || lower.contains("option not found")) {
                code="UNSUPPORTED_OPTION";message="Comando non supportato dal convertitore MP3";engine=true;
            }else if(lower.contains("no space left on device")) {
                code="NO_SPACE";message="Spazio sul telefono insufficiente per la conversione";engine=true;
            }else if(lower.contains("permission denied")) {
                code="ACCESS_DENIED";message="Il convertitore non può accedere ai file temporanei";engine=true;
            }else if(lower.contains("invalid data found when processing input")) {
                code="INVALID_AUDIO";message="Il file scaricato non contiene audio convertibile";
            }else if(lower.contains("decoder") && lower.contains("not found")) {
                code="DECODER_MISSING";message="Formato audio non supportato dal convertitore";
            }
        }
        Failure failure(int exit, boolean startup) {
            if(!engine && (exit==132 || exit==134 || exit==139)) {
                code="NATIVE_CRASH";message="Il convertitore MP3 si è arrestato sul dispositivo";engine=true;
            }
            return new Failure(message+" (FFmpeg "+exit+")", "FFMPEG_EXIT="+exit+";"+code, engine||startup);
        }
    }
}
