# Download musicali sul telefono

In **Menu → Scarica musica**, incolla un link HTTPS YouTube e scegli se scaricare il solo video o tutta la playlist. I brani vengono elaborati uno alla volta e aggiunti alla memoria privata di Onda: non servono computer o server. La funzione richiede internet; i brani importati si ascoltano offline.

- MP3 a 192 kbps, titolo come nome logico del file, senza numerazione di playlist. Il file fisico nella libreria mantiene il nome SHA-256 usato da Onda.
- Massimo 500 elementi per playlist, 60 minuti e 200 MiB di audio sorgente per brano. Dirette in corso e durate sconosciute vengono rifiutate. Occorrono almeno 600 MiB liberi all'avvio; download e conversione si fermano sotto 100 MiB residui.
- Notifica Android con avanzamento e annullamento. Il servizio di download è separato da quello di riproduzione e non richiede audio focus. Non sono richiesti permessi generali sulla memoria condivisa.
- Dopo un annullamento, un arresto del processo o un errore, **Riprendi i brani rimasti** riprova gli elementi incompleti. Il brano interrotto ricomincia dall'inizio; quelli completati restano in libreria. Non c'è riavvio automatico al boot.
- I video già aggiunti da questa funzione vengono riconosciuti dal loro ID finché la traccia corrispondente esiste. L'importatore conserva anche il controllo SHA-256 sul contenuto. I possibili duplicati musicali con contenuti diversi restano gestibili dallo strumento apposito.
- La coda mostrata è l'ultima avviata. Avviare un nuovo link dopo aver annullato sostituisce la coda precedente, senza cancellare brani importati.

## Metadati del convertitore

L'integrazione porta su Android il comportamento Last.fm del progetto originale, senza avviare Node o Docker. Nella sezione **Metadati Last.fm** si può inserire, sostituire o rimuovere una chiave API. È conservata nelle preferenze private dell'app, esclusa dal backup dell'app e inviata soltanto all'API HTTPS Last.fm. Non viene restituita dal comando di stato, inserita nell'APK o registrata nei log diagnostici. Nessun file `.env` del progetto originale è stato copiato.

Senza chiave si utilizzano i dati musicali di YouTube, oppure il titolo ripulito dalle indicazioni «Official Video» e simili. Il canale serve soltanto a disambiguare `artista - titolo`; non diventa arbitrariamente l'artista. Le versioni live/remix/acustiche non vengono sostituite con metadati della versione in studio.

Last.fm richiede corrispondenza di titolo e artista; una durata differente di oltre 15 secondi scarta il risultato. Titolo, artista, album e tutti i tag recuperati sono scritti nel file MP3 e nella libreria. I tag, deduplicati senza distinzione tra maiuscole e minuscole, formano il genere separato da `; `. Dopo `track.getInfo` si cerca `track.getTopTags` se erano presenti tag, altrimenti `artist.getTopTags`. Sono previsti cache limitata, intervallo tra richieste e pausa per limitazioni del servizio. Errori o timeout conservano i metadati già disponibili e non bloccano l'audio.

## Architettura e server futuro

`DownloadBackend` definisce preparazione, lettura della playlist e download di un elemento, con avanzamento, annullamento e risultato locale con metadati. `LocalDownloadBackend` usa yt-dlp e FFmpeg Android. `MusicDownloads` conserva la coda e importa i risultati; `DownloadService` mantiene il lavoro in primo piano. Il bridge espone `musicDownloadState`, `startMusicDownloads`, `cancelMusicDownloads`, `configureMusicDownloads` e non espone comandi arbitrari.

Un futuro backend remoto potrà implementare `DownloadBackend` e salvare il risultato temporaneo nello stesso formato; la schermata e l'importatore potranno restare gli stessi. Endpoint, autenticazione e trasporto andranno implementati quando sarà disponibile il server: oggi non esiste un collegamento fittizio.

Dipendenze Maven Central: `io.github.junkfood02.youtubedl-android:library:0.18.1` e `ffmpeg:0.18.1`, [sorgenti del wrapper e istruzioni delle build native](https://github.com/yausername/youtubedl-android/tree/0.18.1), licenza GPL-3.0. Il testo della licenza è incluso negli asset `licenses/youtubedl-android.txt`. yt-dlp include QuickJS/EJS per l'estrazione YouTube; prima del lavoro si tenta un aggiornamento dal canale stabile ufficiale; dopo un controllo riuscito si attendono almeno 24 ore prima di ripeterlo. L'aggiornamento ha un timeout di 60 secondi e, se non riesce, si prova il motore già disponibile.

`jniLibs.useLegacyPackaging` fa estrarre gli eseguibili nativi durante l'installazione. Le dipendenze aumentano sensibilmente le dimensioni dell'APK e lo spazio occupato. Il servizio dichiara `dataSync` e, da Android 15, `mediaProcessing`; gestisce il timeout del sistema cancellando il lavoro e chiudendo il servizio.

## Verifiche

```sh
node node_modules/typescript/bin/tsc --project tsconfig.android.json
node node_modules/vite/bin/vite.js build --config vite.android.config.ts
# Dalla cartella android, con Gradle 8.13 e JDK 17:
gradle :app:testDebugUnitTest :app:assembleDebug
# Facoltativo: Playwright installato e browser disponibile:
node tests/android-downloads-ui.cjs
```

I test JVM verificano URL, limiti dei nomi, annullamento, selezione dei brani da riprovare, corrispondenze Last.fm, versioni speciali, tag e fallback in caso di errore. Lo smoke test dell'interfaccia usa un bridge simulato e verifica libreria vuota, video/playlist, progressi, annullamento/ripresa, chiave Last.fm, errori e larghezze 390/320 px. Non simula l'esecuzione reale di yt-dlp o FFmpeg su Android.

Prima di una release, provare su un telefono un breve video disponibile e una piccola playlist: importazione automatica, metadati MP3, ascolto, download a schermo spento, annullamento durante download/conversione, riapertura dopo arresto, recupero dopo perdita di rete e spazio insufficiente. Verificare anche il caso senza notifiche autorizzate e senza chiave Last.fm. I video privati, rimossi o soggetti a restrizioni di YouTube possono non essere disponibili.

La versione resta **1.2.3 (6)**. Questa modifica non pubblica una release.

## Correzione dell'avvio FFmpeg

FFmpeg deve cercare prima nella cartella delle librerie native installate con l'APK e poi in **entrambe** le cartelle `packages/python/usr/lib` e `packages/ffmpeg/usr/lib`, nell'ordine usato dal wrapper yt-dlp. Alcune dipendenze native del convertitore, tra cui `libc++_shared.so`, `libcrypto.so.3` e `libexpat.so.1`, sono distribuite nel pacchetto Python. Cercarle nella sola cartella FFmpeg impediva l'avvio del processo e produceva «Conversione MP3 non riuscita» per ogni brano.

Preparazione e conversione usano ora la stessa configurazione. Un controllo locale `ffmpeg -version`, con timeout di 15 secondi, verifica l'avvio prima della lettura/download della playlist. Un errore globale del motore ferma la coda e lascia riprendibili i brani incompleti. Gli errori relativi al singolo file continuano a permettere il tentativo del brano successivo.

La diagnostica registra codice di uscita FFmpeg e categoria riconosciuta, ad esempio `FFMPEG_EXIT=1;MISSING_LIBRARY:libc++_shared.so`, senza copiare percorsi, URL o testo arbitrario del processo. Include inoltre architetture e dimensione delle pagine di memoria.

L'analisi dei pacchetti 0.18.1 ha trovato tutte le 78 librerie della catena FFmpeg nelle due cartelle, ma tre dipendenze WebP a 64 bit (`libwebp`, `libwebpmux`, `libsharpyuv`) erano allineate a 4 KB. La modalità di compatibilità del manifest non ha risolto l'avvio del processo separato sull'emulatore Android 17 a 16 KB. Le tre librerie sono ora ricompilate per 16 KB, incluse nell'APK per x86_64 e ARM64 e caricate con precedenza sulle copie originali. È stato rimosso il flag di compatibilità inefficace. Sorgenti, licenza, checksum, verifica ELF e procedura riproducibile sono in [native-webp/README.md](native-webp/README.md). L'esecuzione sul dispositivo resta da verificare.

Test di regressione: ricerca delle dipendenze in entrambe le cartelle, classificazione degli errori del linker/encoder, distinzione tra guasti globali e file non convertibili, esclusione di percorsi e URL dalla diagnostica. Dopo aver installato l'APK ricompilato, usare **Riprendi i brani rimasti** per ritentare la coda esistente.
