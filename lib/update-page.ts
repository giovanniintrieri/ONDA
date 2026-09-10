// Served directly by the Worker so this recovery route never depends on cached app bundles or static HTML redirects.
export const updatePage = String.raw`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#141615">
  <title>Aggiorna Onda</title>
  <link rel="icon" href="/favicon.svg">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100svh; padding: 32px 20px; display: grid; place-items: center; background: #141615; color: #edf2e5; font: 16px/1.6 'Segoe UI', Arial, sans-serif; }
    main { width: 100%; max-width: 420px; }
    .brand { margin: 0 0 40px; font-size: 40px; line-height: 1; font-weight: 750; letter-spacing: -.065em; }
    .brand span { color: #d7f96b; }
    h1 { font-size: 28px; line-height: 1.25; letter-spacing: -.03em; }
    p { color: #b2bda4; }
    #status { min-height: 52px; color: #edf2e5; }
    button { width: 100%; min-height: 48px; margin: 20px 0 16px; padding: 12px 16px; border: 0; border-radius: 8px; background: #d7f96b; color: #19230d; font: inherit; font-weight: 650; cursor: pointer; }
    button:disabled { cursor: wait; opacity: .65; }
    a { color: #c5dca1; text-underline-offset: 4px; }
    button:focus-visible, a:focus-visible { outline: 2px solid #d7f96b; outline-offset: 4px; }
  </style>
</head>
<body>
  <main>
    <p class="brand">onda<span>.</span></p>
    <h1>Aggiorniamo Onda.</h1>
    <p>Musica, playlist e impostazioni restano su questo dispositivo.</p>
    <p id="status" role="status" aria-live="polite">Cerco l’ultima versione…</p>
    <button id="update" type="button">Aggiorna e apri Onda</button>
    <a href="/">Torna a Onda</a>
  </main>
  <script>
    const status = document.getElementById('status');
    const button = document.getElementById('update');
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    function versionOf(worker) {
      if (!worker) return Promise.resolve(null);
      return new Promise(resolve => {
        const channel = new MessageChannel();
        const finish = version => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(version); };
        const timer = setTimeout(() => finish(null), 1200);
        channel.port1.onmessage = event => finish(event.data?.version || null);
        try { worker.postMessage({ type: 'ONDA_VERSION' }, [channel.port2]); }
        catch { finish(null); }
      });
    }
    async function update() {
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = 'Cerco l’ultima versione…';
      try {
        if (!('serviceWorker' in navigator)) throw new Error('Apri questo link nel browser in cui utilizzi Onda.');
        const response = await fetch('/precache.json?check=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok || response.redirected) throw new Error('Apri Onda per accedere, poi riprova l’aggiornamento.');
        const manifest = await response.json();
        if (!/^[a-f0-9]{16}$/.test(manifest.version)) throw new Error('Non riesco a verificare la nuova versione. Riprova.');
        status.textContent = 'Scarico la nuova versione. Tieni aperta questa pagina.';
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
        await registration.update();
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline) {
          const waiting = registration.waiting;
          if (waiting && await versionOf(waiting) === manifest.version) {
            status.textContent = 'Apro la versione aggiornata…';
            waiting.postMessage({ type: 'ONDA_ACTIVATE_UPDATE' });
          }
          if (registration.active?.state === 'activated' && await versionOf(navigator.serviceWorker.controller) === manifest.version) {
            location.replace('/');
            return;
          }
          await pause(500);
        }
        throw new Error('L’aggiornamento non è ancora pronto. Controlla la connessione e riprova.');
      } catch (error) {
        status.textContent = error instanceof TypeError ? 'Non riesco a scaricare l’aggiornamento. Controlla la connessione e riprova.' : error.message || 'Aggiornamento non riuscito. Riprova.';
        button.disabled = false;
        button.textContent = 'Riprova aggiornamento';
      }
    }
    button.addEventListener('click', update);
    update();
  </script>
</body>
</html>
`;
