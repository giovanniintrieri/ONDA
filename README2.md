# Onda

App musicale per telefono in italiano: importa la tua musica, organizza la libreria e decidi come scegliere il prossimo brano. PWA installabile dalla schermata Home; non è un pacchetto APK o IPA.

## Uso

Apri l'app e scegli **Importa musica**, oppure **Prova la demo** per aggiungere quattro loop originali sintetizzati sul dispositivo. Nella libreria puoi cercare, correggere titolo/artista/album/genere, mettere un cuore e creare playlist. Il lettore include coda, volume, ripetizione, riproduzione casuale e comandi Media Session se il browser li supporta.

Apri **Il tuo algoritmo** per assegnare pesi da −10 a +10 a preferiti, artista, genere, novità, ascolti, salti, recenza, durata e varietà casuale. L'anteprima mostra la classifica sui tuoi brani. **Salva e attiva** conserva le regole e le usa nei suggerimenti e quando avvii il mix. Puoi anche scrivere una formula aritmetica. **Ascolta questa anteprima** riproduce esattamente l'ordine visualizzato, anche prima di salvare.

La modalità **Casuale** usa una mescolata Fisher–Yates indipendente dai gusti. In modalità personalizzata la selezione somma i contributi che definisci; non aggiunge criteri nascosti. A parità di punteggio l'ordine è casuale. La coda già avviata mantiene il proprio ordine; riavvia il mix per applicare le nuove regole. Lo shuffle del lettore è un controllo separato che può scegliere di nuovo un brano già passato.

## Algoritmo locale

`lib/algorithm.ts` calcola affinità con artista e genere dal feedback sugli altri brani. Un ascolto viene contato dopo 30 secondi effettivi oppure metà durata per i brani brevi. Un cambio manuale prima della soglia registra un salto. L'ascolto è misurato nella scheda attiva; i sistemi che sospendono il browser in background possono rendere incompleta questa statistica.

Le regole iniziali favoriscono preferiti (+5), artista (+4), genere (+2), mai ascoltati (+3), penalizzano salti (−2 ciascuno) e ascolti recenti (fino a −6), e aggiungono varietà (da 0 a +2). Il contributo di recenza si dimezza dopo un giorno. I suggerimenti escludono il brano in riproduzione.

L'editor formula supporta solo numeri, variabili documentate, operatori aritmetici e min/max/abs/sqrt/log/floor. Il parser ha limiti di lunghezza, token e profondità, rifiuta risultati non finiti e non usa eval o Function. Il modello è una selezione euristica trasparente; non analizza il segnale audio e non contatta cataloghi o modelli esterni.

## File e memoria

I file audio vengono copiati in IndexedDB sul dispositivo; non sono caricati sul server. Audio e metadati sono separati, e solo il brano selezionato viene letto per la riproduzione. Preferiti e statistiche usano transazioni atomiche. La reimportazione con stesso nome, dimensione e data viene ignorata senza sovrascrivere il feedback; non è una deduplicazione per contenuto.

I tag e le copertine provengono da `music-metadata`, caricato quando serve. Formati importabili: MP3, M4A/MP4 audio, FLAC, WAV, AAC, OGG/Opus e AIFF; la riproduzione effettiva dipende dal codec supportato dal browser. Le copertine ammesse sono JPEG, PNG e WebP fino a 3 MB. Non vengono modificati i file originali.

La libreria vive nel browser e nell'origine HTTPS di questa app. Non si sincronizza tra dispositivi. Cancellare i dati del sito, la modalità privata o la pulizia automatica dello spazio possono eliminare i dati locali. L'app permette di chiedere memoria persistente; la concessione dipende dal browser. L'importazione gestisce gli errori di quota senza eliminare i file già salvati.

## Offline e installazione

L'app precache tutti gli asset locali e la pagina iniziale dopo una prima apertura online. La dicitura **Pronta offline** compare quando un service worker è attivo. Il pulsante Installa apre le istruzioni specifiche del browser, lo stato offline e la protezione della memoria.

Il service worker non salva risposte di login, redirect, API o richieste esterne. Conserva solo la pagina generica dell'app e gli asset di compilazione; le informazioni personali vengono lette da IndexedDB. Gli aggiornamenti aspettano la chiusura delle vecchie schede per mantenere allineati pagina e asset. Il completamento della cache richiede connessione e spazio sufficienti. Un eventuale rinnovo dell'accesso privato al sito può richiedere internet.

Su Android il browser può proporre l'installazione; altrimenti usare il menu → Installa app/Aggiungi a schermata Home. Su iPhone aprire in Safari e usare Condividi → Aggiungi a Home. La riproduzione in background e a schermo bloccato dipende dal sistema operativo; non è garantita come in un'app nativa.

Riferimenti tecnici: [Service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [Installazione PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Implementazione e verifica

React, TypeScript, Vinext/Vite, componenti Shadcn, IndexedDB. Nessun database o storage audio remoto. Il componente del cursore audio gestisce gli aggiornamenti frequenti separatamente dalla libreria. La tabella mostra 60 brani alla volta con ricerca sull'intera collezione.

I comandi della schermata di blocco restano collegati allo stesso elemento audio per tutta la sessione. Ascolti, preferiti e aggiornamenti della libreria non li ricreano. Stato e posizione vengono comunicati al sistema dagli eventi audio; i comandi opzionali non supportati sono ignorati singolarmente. Il cursore visibile smette di aggiornarsi quando la pagina è nascosta e si riallinea alla riapertura. Una pausa del sistema o dell'utente non avvia una ripresa automatica. Queste misure non impediscono al sistema operativo di sospendere il browser.

- `node --test tests/algorithm.test.mjs tests/music.test.mjs`: pesi, recenza, affinità, casualità, parser, demo audio, dati locali, duplicati, feedback concorrente e rimozioni mirate.
- `node --test tests/media-session.test.mjs`: stato audio, comandi con coda aggiornata, pause, posizioni e supporto parziale della Media Session, con eventi nativi simulati.
- `npm run build`: compila il Worker e prepara il manifesto offline degli asset.
- `node --test tests/rendered-html.test.mjs tests/offline.test.mjs`: rendering dal Worker e cache offline con risposte simulate.
- `npx tsc --noEmit`: controllo TypeScript.

La verifica in browser su telefoni fisici, inclusi audio in background e installazione, resta da effettuare. I test del service worker verificano la logica delle richieste e non sostituiscono questa prova.


## Correzione installazione

Il manifest viene richiesto con `crossorigin="use-credentials"`, necessario per l'accesso privato. Il service worker lascia le rotte riservate di accesso `/signin-with-chatgpt`, `/signout-with-chatgpt` e `/callback` alla piattaforma senza intercettarle. Nessuna rotta OAuth viene implementata nell'app. Le pagine mancanti offrono un link alla home.

Il pannello di installazione distingue Firefox Android, altri browser Android, iPhone, desktop e finestre incorporate. Quando manca `beforeinstallprompt`, mostra direttamente i passaggi nel menu del browser; il pulsante di installazione diretta appare solo se il browser lo rende disponibile. Lo stato “installata” richiede `appinstalled` o modalità standalone, non la sola accettazione della richiesta.

Riferimenti: [Manifest con credenziali](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest), [Firefox per Android](https://support.mozilla.org/en-US/kb/use-web-apps-firefox-android).
