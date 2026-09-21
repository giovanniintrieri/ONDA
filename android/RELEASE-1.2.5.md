# Onda 1.2.5 (8)

## Novità da copiare nella release

- Nuova pagina **Cerca musica**: ricerca per titolo, artista o entrambi, con risultati paginati.
- Ricerca per artista con elenco dei suoi brani ordinati per popolarità e ritorno agli artisti trovati.
- Recupero del collegamento YouTube tramite TheAudioDB, verificando titolo e artista del brano selezionato.
- Corretto il filtro per titolo: cercando “the cure” non vengono più inclusi brani che corrispondono soltanto al nome dell'artista.
- Riconoscimento delle verifiche Last.fm e possibilità di aprire il brano dentro Onda per recuperare il link quando l'API non lo fornisce.
- Download del brano selezionato nella coda esistente, con protezione dei download già in corso e scelta esplicita per sostituire una coda interrotta.
- Messaggi diagnostici distinti per l'API video e la pagina Last.fm; tempi di attesa adeguati alle risposte di TheAudioDB.

La versione comprende anche le funzioni già distribuite con la 1.2.4: conversione YouTube → MP3 sul telefono, download di playlist, metadati Last.fm, playlist automatiche, casuale intelligente, diagnostica e gestione dei duplicati.

## Generare i file da pubblicare

Compilare sul PC usato per le versioni già installate, conservando la stessa chiave Android. La firma dell'APK di verifica prodotto nell'ambiente remoto è diversa: quel file non è un aggiornamento distribuibile alle installazioni esistenti.

Il codice della 1.2.5 è configurato con `versionName=1.2.5`, `versionCode=8`, package `it.onda.player` e la stessa sorgente degli aggiornamenti. Dopo il merge su `main`, dalla cartella del repository eseguire in PowerShell un comando alla volta, proseguendo solo se riesce:

```powershell
git switch main
git pull --ff-only origin main
node scripts/build-android.mjs
node scripts/android-release.mjs package
```

La versione è già impostata nel repository: non ripetere il comando `version`.

I file da caricare vengono generati insieme in:

- `android/releases/v1.2.5/onda.apk`
- `android/releases/v1.2.5/update.json`

Il manifest contiene dimensione e SHA-256 dell'APK prodotto sul PC. Non utilizzare un manifest generato per un altro APK.

## Pubblicazione su GitHub

Aprire [Nuova release di Onda](https://github.com/giovanniintrieri/ONDA/releases/new), creare il tag **v1.2.5** con destinazione **main** e titolo **Onda 1.2.5**. Copiare le novità sopra, allegare `onda.apk` e `update.json`, impostare **Latest** e pubblicare senza selezionare prerelease.

Gli allegati delle versioni precedenti restano invariati. Il controllo aggiornamenti di Onda leggerà il nuovo manifest dalla release Latest e proporrà la 1.2.5 alle installazioni precedenti.

## Verifica dell'aggiornamento

Preparazione verificata: controllo TypeScript, build Vite, `assembleDebug`, `lintDebug`, **65 test JUnit** e **7 test della procedura aggiornamenti** superati. Controllati anche versione e package nel manifest Android dell'APK, validità della firma, generazione del manifest di aggiornamento, corrispondenza SHA-256 e dimensione entro il limite di 200 MiB.

Il recupero del link per **the cure / Olivia Rodrigo** è stato verificato tramite l'API e il codice Java. Le prove automatiche non sostituiscono il controllo dell'aggiornamento sul dispositivo.

Installare l'APK come aggiornamento dell'app esistente e verificare la versione **1.2.5 (8)** nella diagnostica, la conservazione di libreria e playlist e la ricerca per titolo e artista. Per **the cure / Olivia Rodrigo**, il recupero API deve mostrare **Collegamento YouTube trovato tramite TheAudioDB**; avviare il download soltanto dal pulsante dedicato.

Le istruzioni sui provider e sui risultati delle verifiche sono in [SEARCH.md](SEARCH.md); il funzionamento degli aggiornamenti e della firma è descritto in [UPDATES.md](UPDATES.md).
