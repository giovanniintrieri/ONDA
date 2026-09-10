# Aggiornamenti di Onda dall’app

La funzione aggiunge controllo automatico, download gestito da Android, verifica dell’APK e avvio dell’installazione con conferma. Non è ancora attiva nella versione che hai già installato: serve un primo aggiornamento manuale con questa modifica e con la sorgente configurata.

## Prima configurazione

1. Scegli un repository GitHub per distribuire gli aggiornamenti. Questa implementazione usa download pubblici, senza login: può essere un repository dedicato contenente solo un README e gli APK nelle Releases; il codice sorgente può restare dove si trova. Prima di pubblicare controlla di aver selezionato il repository e la visibilità desiderati. Un repository privato richiederebbe un diverso sistema di distribuzione autenticato.
2. Nella cartella principale di Onda, configura il repository. Sostituisci `TUO_UTENTE/onda-updates` con il proprietario e il nome reali:

   ```powershell
   node scripts/android-release.mjs configure TUO_UTENTE/onda-updates
   ```

3. Compila la prima versione con il controllo degli aggiornamenti:

   ```powershell
   node scripts/build-android.mjs
   ```

4. Se la compilazione riesce, installa sul telefono `android/app/build/outputs/apk/debug/app-debug.apk` come aggiornamento della versione esistente. Non disinstallare Onda. Questa versione parte da `versionCode=2`, `versionName=1.1.0`.
5. Prepara i file da pubblicare:

   ```powershell
   node scripts/android-release.mjs package
   ```

   Troverai `onda.apk` e `update.json` in `android/releases/v1.1.0/`.
6. Nel repository scelto, apri **Releases → Draft a new release**, crea il tag `v1.1.0`, allega entrambi i file e pubblica la release impostandola come **Latest**. Non selezionare una prerelease. Se GitHub richiede un commit di partenza, inizializza il repository con un README.
7. In Onda apri **App → Controlla aggiornamenti**. Avendo già installato la stessa versione, deve comparire **Onda è aggiornata**. Se la release non è ancora pubblicata, il controllo segnala che non è riuscito; la musica continua a funzionare.

Non è stato inserito un indirizzo inventato nella configurazione: `updateUrl` è vuoto finché non esegui il comando configure. Senza quell’indirizzo la funzione resta disabilitata.

## Pubblicare ogni aggiornamento successivo

Dopo aver applicato le modifiche al codice, aumenta sia il codice numerico sia il nome della versione. Per la versione successiva alla 1.1.0:

```powershell
node scripts/android-release.mjs version 3 1.2.0
node scripts/build-android.mjs
node scripts/android-release.mjs package
```

Esegui un comando alla volta e prosegui solo se termina correttamente. Il pacchetto sarà in `android/releases/v1.2.0/`. Crea la release GitHub con tag esatto `v1.2.0`, allega `onda.apk` e `update.json` e impostala come Latest.

Onda leggerà il manifest dalla release Latest. Il manifest punta all’APK del tag preciso, così non viene associato per errore a un file di un’altra versione. Non modificare i file già pubblicati: per una correzione usa un nuovo versionCode e un nuovo tag. Il comando package rifiuta una cartella di release già presente.

Se cambi il repository configurato, ricompila: l’indirizzo è incluso nell’APK. Le installazioni che usano ancora il vecchio repository devono poter ottenere da lì un aggiornamento che contenga il nuovo indirizzo.

## Firma e conservazione dei dati

Questa modifica mantiene `it.onda.player` e il flusso di compilazione debug già usato sul tuo PC, per aggiornare l’installazione attuale. Conserva la chiave debug con cui è stato generato il primo APK, normalmente in `C:\Users\giovanni\.android\debug.keystore`. Cambiare PC o rigenerare quella chiave può produrre una firma diversa, che non aggiorna l’app esistente.

Per una distribuzione definitiva si deve pianificare una firma release stabile e il passaggio dall’attuale installazione di sviluppo. Questa modifica non effettua quel passaggio e non sostituisce la firma. Non caricare chiavi di firma nelle Releases o in un repository pubblico.

L’aggiornamento sostituisce il programma mantenendo memoria interna e database. La funzione non modifica l’archivio musicale. La conservazione dei dati va verificata sul telefono prima di distribuire la versione ad altre persone. Disinstallazione o cancellazione dei dati eliminano la libreria locale.

## Comportamento nell’app

- Controllo all’apertura o al ritorno nell’app, al massimo una volta ogni 30 minuti. Il pulsante manuale controlla subito. Non sono previsti controlli periodici mentre l’app è chiusa.
- Una nuova versione fa apparire il pulsante **Aggiorna** e un avviso. Il download parte premendo **Scarica aggiornamento**.
- Download tramite DownloadManager di Android: può proseguire con l’interfaccia sospesa. Lo stato viene recuperato alla riapertura. Se Android ha eliminato il download o il file, si può riprovare.
- L’avanzamento viene letto una volta al secondo solo con l’interfaccia visibile e un download attivo.
- Prima di proporre l’installazione vengono verificati dimensione, SHA-256, identificativo dell’app, versione, compatibilità Android e corrispondenza della firma. I byte vengono verificati in un thread separato e conservati nella cache privata.
- **Installa aggiornamento** apre il programma di installazione Android. Al primo utilizzo potrebbe essere necessario consentire a Onda l’installazione di app: dopo aver concesso il permesso, torna in Onda e premi nuovamente Installa. L’installazione richiede conferma e interrompe la riproduzione.
- Connessione assente, download fallito o pacchetto non valido non cancellano i brani e non impediscono l’ascolto offline.

## Verifiche eseguite e prova richiesta

Eseguiti: controllo TypeScript, build dell’interfaccia Android e sette test mirati. I test verificano la selezione delle azioni nell’interfaccia, rifiuto di configurazioni non valide e build non coerenti, generazione del manifest e dei checksum. Il validatore Java dei manifest viene compilato ed eseguito sulla JVM. I test di pubblicazione usano byte di prova: non dimostrano che un APK sia installabile.

Non eseguiti nell’ambiente di preparazione: build completa Android e installazione su un dispositivo, perché l’SDK Android non è disponibile. Le classi che dipendono da Android devono ancora passare la compilazione sul tuo PC. Per collaudare il flusso:

1. Installa manualmente la 1.1.0 configurata. Importa almeno un brano e crea una playlist e un preferito.
2. Pubblica la 1.2.0 con la stessa firma, poi premi Controlla aggiornamenti nella 1.1.0.
3. Avvia il download mentre ascolti musica; prova a bloccare lo schermo e a riaprire l’app. Verifica anche annullamento e nuovo download.
4. Installa dal pulsante di Onda, compreso il primo permesso Android. Verifica versione 1.2.0, brano, playlist e preferito conservati.
5. Ripeti un controllo senza rete: la libreria e l’ascolto devono restare disponibili.

Test locali, con Node e JDK 17 disponibili nel terminale:

```powershell
node --test tests/android-updates.test.mjs
```

Riferimenti: [download delle GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases), [gestione delle Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository), [DownloadManager](https://developer.android.com/reference/android/app/DownloadManager), [FileProvider](https://developer.android.com/training/secure-file-sharing/setup-sharing), [permesso per l’installazione](https://developer.android.com/reference/android/content/pm/PackageManager#canRequestPackageInstalls()), [firma degli aggiornamenti](https://developer.android.com/studio/publish/app-signing#considerations).
