# Onda 1.2.4 (7)

## Novità

- Download di video e playlist YouTube, conversione MP3 a 192 kbps sul telefono e importazione nella libreria.
- Coda con avanzamento, annullamento e ripresa dei brani rimasti; metadati Last.fm facoltativi.
- Playlist automatiche e casuale intelligente.
- Diagnostica dal telefono e gestione manuale dei duplicati.
- Home semplificata, senza le quattro schede dei suggerimenti.
- Correzioni all'avvio di FFmpeg e librerie WebP ARM64/x86_64 ricompilate per pagine di memoria da 16 KB.

## Pubblicazione dell'APK

Compilare sul PC usato per la 1.2.3, conservando la stessa chiave Android. L'APK di verifica compilato nell'ambiente di sviluppo remoto ha una firma diversa e non va distribuito come aggiornamento.

Dalla cartella del repository, dopo il merge su main, eseguire in PowerShell un comando alla volta, proseguendo solo se riesce:

```powershell
git switch main
git pull --ff-only origin main
node scripts/build-android.mjs
node scripts/android-release.mjs package
```

La versione è già configurata: non eseguire nuovamente il comando `version`.

Installare l'APK sopra l'app esistente, senza disinstallarla. Verificare un breve download e una piccola playlist, la ripresa della coda e la conservazione della libreria. Le verifiche automatiche non sostituiscono questa prova: il download reale e la correzione sul dispositivo da 16 KB devono ancora essere confermati sul dispositivo.

Aprire https://github.com/giovanniintrieri/ONDA/releases/new e creare una release con tag **v1.2.4**, destinazione **main**, titolo **Onda 1.2.4**. Copiare le novità sopra e allegare entrambi i file generati:

- `android/releases/v1.2.4/onda.apk`
- `android/releases/v1.2.4/update.json`

Pubblicare come **Latest**, senza selezionare prerelease. Non sostituire gli allegati della 1.2.3. APK e manifest vanno caricati nelle Releases; non è necessario aggiungerli al repository del codice.

In Onda, il controllo aggiornamenti leggerà il nuovo manifest e proporrà la 1.2.4 alle installazioni precedenti.
