# WebP per FFmpeg su Android a 16 KB

Il pacchetto FFmpeg 0.18.1 contiene tre dipendenze WebP a 64 bit con segmenti LOAD allineati a 4 KB. Su un processo nativo avviato separatamente, il flag di compatibilità del manifest dell'app non risolve il caricamento: il linker può rifiutare le librerie prima di eseguire FFmpeg.

Le copie in `app/src/main/jniLibs/{x86_64,arm64-v8a}` sono compilate dai sorgenti ufficiali **libwebp 1.6.0**, con **Android NDK r28c / 28.2.13676358**, API minima 26. Mantengono i SONAME senza versione richiesti dal pacchetto FFmpeg. `FfmpegRuntime` mette la cartella nativa installata davanti alle cartelle estratte Python/FFmpeg, così queste copie hanno precedenza sui vecchi file. Le altre dipendenze e le architetture a 32 bit rimangono quelle del wrapper.

Sorgente: https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.6.0.tar.gz

SHA-256 sorgente: `e4ab7009bf0629fd11982d4c2aa83964cf244cffba7347ecd39019a9e38c4564`.

NDK Linux: https://dl.google.com/android/repository/android-ndk-r28c-linux.zip

SHA-1 NDK verificato contro il catalogo Android SDK: `a7b54a5de87fecd125a17d54f73c446199e72a64`.

Le opzioni di collegamento impostano sia `max-page-size` sia `common-page-size` a 16384. I test controllano header ELF, architettura, allineamento e congruenza dei segmenti LOAD, fine del segmento RELRO e SHA-256. La verifica dei simboli ha confermato la presenza dei 15 simboli WebP richiesti da `libavcodec` per entrambe le architetture. Il testo della licenza BSD è incluso nell'APK in `assets/licenses/libwebp.txt`.

La compilazione normale di Onda, anche da Windows, **non richiede NDK o strumenti aggiuntivi**: usa i sei file già inclusi. Per rigenerarli su Linux, un manutentore può impostare `ONDA_NDK_ROOT` e lanciare `bash scripts/build-native-webp.sh`; servono curl, make, Python 3 e Node. Lo script verifica i sorgenti, ricompila e aggiorna `manifest.json` con i checksum.

Questi controlli verificano i binari e il loro inserimento nell'APK. Non sostituiscono la prova di esecuzione su un dispositivo Android a 16 KB.
