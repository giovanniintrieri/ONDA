# Playlist e strumenti della libreria

Le funzionalità riguardano l’app Android (`mobile/` e servizio audio nativo).

- **Playlist automatiche**: accessibili dalla home e dal menu. “Aggiunti di recente” include gli ultimi 30 giorni; “Mai ascoltati” usa gli ascolti effettivamente registrati; “Più ascoltati” mostra fino a 50 brani; “Dimenticati” include brani già ascoltati, ma non negli ultimi 30 giorni. Non sono playlist salvate: cambiano con importazioni, eliminazioni e ascolti. Le playlist manuali restano modificabili come prima.
- **Casuale intelligente**: attivato dal comando casuale del lettore. Il servizio Android genera l’ordine, anche per l’ascolto a schermo spento. Visita ogni brano una volta per giro, distanzia lo stesso artista quando rimangono alternative e riduce la priorità degli ascolti recenti. Il brano scelto esplicitamente resta quello iniziale. Con un solo brano e ripetizione attiva la ripetizione è inevitabile.
- **Diagnostica**: dal menu o dal pulsante “Diagnostica”. Mostra versione, Android/WebView, spazio disponibile, notifiche, batteria, lettore e fino a 40 errori nativi. Gli ultimi 20 errori dell’interfaccia appartengono alla sessione corrente. “Copia rapporto” usa gli appunti Android, senza inviare dati. La schermata di errore iniziale permette ugualmente di copiare la diagnostica.
- **Possibili duplicati**: dal menu, confronto per titolo e artista normalizzati e durata entro 2 secondi. Non analizza l’audio; conserva i suffissi live/remix e ignora metadati insufficienti. L’utente ascolta le copie, sceglie quella da tenere e quelle da unire, quindi conferma. Una transazione aggiorna playlist, stato salvato e statistiche; il servizio aggiorna la coda. Vengono eliminate soltanto le copie private di Onda. I file originali non sono modificati.

## Verifiche automatiche

```sh
node node_modules/typescript/bin/tsc --project tsconfig.android.json
node node_modules/vite/bin/vite.js build --config vite.android.config.ts
node --test tests/library-insights.test.mjs tests/playlist-genres.test.mjs tests/shuffle.test.mjs tests/algorithm.test.mjs tests/android-updates.test.mjs
```

Il test `library-insights` esegue anche le regole Java con un JDK, senza emulatore.

## Prova sul telefono

1. Compilare con `node scripts/build-android.mjs` e installare l’APK di debug con la stessa firma dell’app esistente, conservandone i dati.
2. Aprire “Mai ascoltati”, ascoltare un brano per 30 secondi (o metà durata per un brano più breve), verificare che la selezione si aggiorni.
3. Avviare una playlist con casuale attivo. Controllare avanti/indietro, fine giro con ripetizione, cuffie e schermo spento; chiudere e riaprire l’app per controllare il ripristino della coda.
4. Aprire la diagnostica, aggiornarla e copiare il rapporto.
5. Importare due file diversi dello stesso brano. Inserirli in una playlist, assegnare un preferito e alcuni ascolti, quindi unirli. Verificare playlist, preferito, somma degli ascolti e presenza della copia scelta dopo il riavvio. Ripetere con una copia nella coda e con una copia in riproduzione.
6. Controllare che annullare la conferma non elimini nulla e che una versione live con titolo diverso non sia proposta nello stesso gruppo.

Queste modifiche non preparano né pubblicano una release. La versione di base rimane la 1.2.3.
