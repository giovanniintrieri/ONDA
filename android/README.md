# Onda Android

Progetto Android con interfaccia React inclusa nell’APK e riproduzione nativa Media3/ExoPlayer. Non apre il sito e non richiede Firefox, Chrome, un server acceso o un certificato HTTPS locale.

## Aggiornamenti dall’app

La variante Android include ora controllo delle nuove versioni, download e avvio dell’installazione. Prima di utilizzarli configura il repository di distribuzione e compila il primo APK: procedura completa in [UPDATES.md](UPDATES.md). La riproduzione resta offline; la rete viene usata solo per cercare o scaricare un aggiornamento.

## Compilare su Windows

1. Installa Android Studio e, in **SDK Manager**, Android SDK Platform 36 e Android SDK Build-Tools 35.0.0. Android Studio fornisce anche Java. Installa Node.js 22 o successivo se non è già presente.
2. Apri un terminale nella cartella principale di Onda, dove si trova `package.json`.
3. Esegui `npm ci` se mancano le dipendenze o provengono da un altro computer.
4. Esegui `node scripts/build-android.mjs`.
5. Il risultato, se la compilazione termina senza errori, è `android/app/build/outputs/apk/debug/app-debug.apk`. Trasferiscilo sul telefono e aprilo per installare Onda. Puoi anche installarlo da Android Studio con il telefono collegato.

Il primo avvio della compilazione richiede internet per Gradle e le dipendenze Android. L’app installata lavora offline. Il comando genera un APK di sviluppo, firmato con la chiave debug locale; per distribuire aggiornamenti definitivi occorre configurare e conservare una chiave release propria.

Lo script scarica Gradle 8.13 dal sito ufficiale e verifica SHA-256. Non cambia le impostazioni globali di Java o del sistema. Se Java è installato altrove, imposta `JAVA_HOME` sulla sua cartella (JDK 17 o successivo compatibile). Se l’SDK è altrove, imposta `ANDROID_HOME` sulla cartella SDK.

## Aprire e lavorare con Android Studio

Apri questa cartella `android`. Usa Gradle 8.13: la distribuzione scaricata dallo script è nella cartella principale di Onda, `.android-tools/gradle-8.13`. Per creare i normali script wrapper, da un terminale con questa versione di Gradle esegui `gradle wrapper --gradle-version 8.13`. I file wrapper standard non sono inclusi perché la distribuzione Gradle non è stata scaricabile nell’ambiente di preparazione.

Dopo una modifica all’interfaccia, dalla cartella principale esegui:

```text
node node_modules/typescript/bin/tsc --project tsconfig.android.json
node node_modules/vite/bin/vite.js build --config vite.android.config.ts
```

Poi ricompila l’APK. Gli asset generati si trovano in `app/src/main/assets/ui` e vengono inclusi nell’app.

## Funzioni recuperate

- Libreria locale, ricerca, ordinamento, importazione multipla e cartelle.
- Copertine e metadati, modifica delle informazioni, preferiti e playlist.
- Regole, formula e suggerimenti dell’algoritmo Onda esistente; demo musicali.
- Coda, shuffle, ripetizione coda/brano, volume e posizione.
- Riproduzione, avanzamento automatico, statistiche e comandi multimediali gestiti dal servizio Android anche senza interfaccia attiva.
- Pausa per perdita di audio focus e scollegamento cuffie gestite da ExoPlayer.
- Ripristino della coda in pausa dopo riapertura, senza ripartenze indesiderate.

## Memoria e importazione

I file selezionati vengono copiati in memoria privata. Gli originali non vengono modificati. L’importazione legge i file in blocchi; lo stesso contenuto viene riconosciuto tramite SHA-256 anche se rinominato. Metadati mancanti non bloccano l’importazione. I formati effettivamente riproducibili dipendono da Media3 e dai decoder del dispositivo.

SQLite conserva playlist, preferiti, regole e statistiche. Le copertine sono ridotte durante l’importazione. Il servizio mantiene la coda e avanza autonomamente; nessun comando a schermo spento richiede JavaScript.

La libreria già presente in Firefox/Chrome resta nel browser: questa app non può leggerla automaticamente. Reimporta gli originali nell’app. Playlist, preferiti e statistiche web non vengono trasferiti in questa versione. Non cancellare i dati del browser se vuoi conservarli.

Disinstallare Onda o cancellarne i dati elimina la libreria nativa. Un aggiornamento dell’APK con stesso package e stessa firma la mantiene. Il package dell’app è `it.onda.player`.

## Verifica sul telefono

Verifiche eseguite: controllo TypeScript e build dell’interfaccia riusciti; 11 test dell’algoritmo/coda esistente superati; regole della coda Java verificate sulla JVM; sintassi Java analizzata. La compilazione completa e il collaudo Android non sono stati eseguiti nell’ambiente di preparazione: mancavano SDK e Gradle. Queste verifiche non dimostrano la compatibilità delle API Android né il comportamento su un telefono. Prima di considerare la conversione pronta all’uso verifica:

1. Importa almeno tre brani e avvia una coda. Controlla Pausa, Precedente, Successivo e avanzamento nella notifica e a schermo bloccato. Android decide la disposizione dei comandi.
2. Lascia lo schermo spento fino al cambio automatico del brano; prova anche i comandi delle cuffie.
3. Prova shuffle e ripetizione dell’intera coda e del singolo brano, anche oltre la fine della coda.
4. Scollega le cuffie e verifica la pausa. Prova un’interruzione da un’altra sorgente audio.
5. Riapri l’interfaccia durante la riproduzione: deve mostrare lo stesso brano del pannello Android. Chiudi l’interfaccia e verifica che il servizio continui durante l’ascolto.
6. Riavvia l’app a riproduzione ferma: libreria, playlist, regole e coda devono essere conservate. Prova tutto senza connessione.
7. Verifica preferiti, modifica metadati, cancellazione dalla libreria e conteggio ascolti/salti.

Il frontend originale resta disponibile nei suoi file. La variante Android è in `mobile/`; i componenti UI e l’algoritmo sono condivisi. Le modifiche future alla pagina web non si trasferiscono automaticamente alla pagina Android.
