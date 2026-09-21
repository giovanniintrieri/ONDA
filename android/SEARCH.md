# Ricerca musica

Dal menu **Cerca musica**, inserire il titolo del brano, il nome dell'artista oppure entrambi. Con il solo artista, `artist.search` mostra gli artisti corrispondenti; scegliendone uno, `artist.getTopTracks` elenca i suoi brani in ordine di popolarità su Last.fm, con paginazione e ritorno ai risultati degli artisti. La ricerca per titolo usa `track.search` di Last.fm con la chiave già salvata in **Scarica musica → Metadati Last.fm**. La chiave non attraversa il bridge WebView e non è inclusa nel codice o nell'APK.

Onda richiede pagine da 20 risultati e controlla che il testo del titolo compaia nel titolo del brano, non soltanto nel nome dell’artista. Se viene compilato anche il campo artista, entrambi i campi devono corrispondere. Il confronto ammette ricerche parziali e ignora maiuscole, accenti e differenze nella punteggiatura. Dopo il filtro una pagina può contenere meno di 20 risultati o essere vuota: la navigazione verso le pagine successive resta disponibile quando Last.fm ne segnala altre. La ricerca per solo artista e l’elenco dei suoi brani restano separati. Selezionando un risultato, Onda legge la pagina Last.fm e cerca esclusivamente il collegamento YouTube del comando principale `header-new-playlink`. Non seleziona i video dei brani simili presenti nella stessa pagina. Il download parte solo premendo **Scarica sul telefono**, quindi si apre la schermata della coda esistente. Metadati, conversione e riconoscimento dei duplicati restano gestiti dal motore di download.

Last.fm non documenta un campo YouTube nelle API: la lettura del sito è un'integrazione soggetta a cambiamenti e blocchi automatici. Se il collegamento manca, la pagina cambia o il sito impedisce la lettura, Onda propone di riprovare, aprire il brano nel browser oppure passare al download tramite link manuale. Nessun aggiramento delle verifiche del sito. La ricerca API continua a essere utilizzabile indipendentemente dal recupero del video.

La ricerca usa un thread separato dall'archivio e dal lettore, una sola richiesta alla volta, timeout, limite di risposta di 2 MiB e cache in memoria di 20 pagine. Le richieste HTTP non espongono chiavi, indirizzi o risposte del servizio nei messaggi di errore. I redirect sono ammessi soltanto verso pagine di brani HTTPS su Last.fm; i link video sono validati con le regole YouTube già usate dal convertitore. Errori di limite richieste sospendono le chiamate per un minuto.

Una coda attiva impedisce l'avvio di un altro download ma non la ricerca. Sostituire una coda interrotta richiede una scelta esplicita, verificata anche nel codice Android; i brani già importati restano nella libreria.

## Verifiche

- Test JVM su risultati multipli/singoli/vuoti di brani e artisti, paginazione dei brani dell’artista, duplicati, errori API, validazione URL e selezione del solo video principale.
- `tests/android-search-ui.cjs`: ricerca con bridge simulato, configurazione mancante, filtro artista, paginazione, collegamento mancante, apertura browser, coda attiva/interrotta, avvio esplicito del download, errori e larghezze 390/320 px.
- Controlli dal vivo di `artist.search` e `artist.getTopTracks` con Imagine Dragons: artista trovato e prima pagina di 20 brani ricevuta.
- Controllo dal vivo di `track.search` con Believer / Imagine Dragons: risposta valida e pagina Last.fm del brano presente. La lettura HTTP della pagina dal nostro ambiente ha ricevuto la verifica automatica del sito: il recupero reale del video sul telefono resta da verificare.

Per la prova sul telefono: configurare la chiave, cercare un brano, selezionarlo e verificare il link o il messaggio di indisponibilità. Provare il passaggio al browser, il ritorno all'app e l'avvio del download. Le verifiche automatiche dell'interfaccia non eseguono la conversione reale.

Riferimenti: https://www.last.fm/api/show/track.search e https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/lastfm.py.
