// Optional device-size UI smoke with a fake native bridge. Build vite.android.config.ts first.
// PLAYWRIGHT_MODULE and PLAYWRIGHT_EXECUTABLE can point to an existing Playwright installation/browser.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '../android/app/src/main/assets/ui');
  const server = require('node:http').createServer((req, res) => {
    const file = path.join(root, req.url === '/' ? 'index.html' : req.url);
    try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file)); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}), headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.calls = []; window.downloadState = { lastFmConfigured: false };
      window.OndaAndroid = { postMessage(raw) {
        const { id, method, params } = JSON.parse(raw); window.calls.push({ method, params });
        let result = null, error;
        if (method === 'library') result = { tracks: [], playlists: [] };
        else if (method === 'state') result = { currentId: null, playing: false, queue: [], shuffle: false, repeat: 0, volume: .7, position: 0, duration: 0 };
        else if (method === 'updateState') result = { phase: 'current', installedVersion: '1.2.4' };
        else if (method === 'musicDownloadState') result = window.downloadState;
        else if (method === 'searchLastFm') {
          if (params.title === 'errore') error = 'Ricerca non riuscita. Controlla la connessione e riprova.';
          else result = { page: params.page, hasMore: params.page === 1, tracks: params.title === 'vuoto' ? [] : [
            { title: 'Believer', artist: 'Imagine Dragons', url: 'https://www.last.fm/music/Imagine+Dragons/_/Believer' },
            { title: 'Un titolo molto lungo con caratteri speciali: Cariño & musica', artist: 'Artista dal nome molto lungo', url: 'https://www.last.fm/music/Artist/_/Other' },
          ] };
        } else if (method === 'resolveLastFmTrack') {
          result = params.url.endsWith('/Other') ? { url: '', message: 'Il collegamento YouTube non è disponibile.' } : { url: 'https://www.youtube.com/watch?v=7wtfhZwyrcc', message: 'Collegamento YouTube trovato sulla pagina Last.fm.' };
        } else if (method === 'startMusicDownloads') {
          window.downloadState = { lastFmConfigured: true, busy: true, stage: 'preparing' }; result = window.downloadState;
        }
        queueMicrotask(() => window.__ondaReply({ id, result, ...(error ? { error } : {}) }));
      }};
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    async function openSearch() {
      await page.locator('[data-slot=sidebar-trigger]').click();
      await page.getByRole('button', { name: 'Cerca musica', exact: true }).click();
      await page.getByRole('heading', { name: 'Cerca musica.' }).waitFor();
    }
    await page.getByRole('heading', { name: 'La tua musica, oggi.' }).waitFor();
    await openSearch();
    await page.getByRole('button', { name: 'Configura Last.fm' }).waitFor();
    await page.getByLabel('Titolo del brano').fill('Believer');
    assert.equal(await page.getByRole('button', { name: 'Cerca brani' }).isDisabled(), true);
    await page.evaluate(() => { window.downloadState = { lastFmConfigured: true }; document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByLabel('Artista facoltativo').fill('Imagine Dragons');
    await page.getByRole('button', { name: 'Cerca brani' }).click();
    await page.getByRole('button', { name: 'Believer Imagine Dragons' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.findLast(c => c.method === 'searchLastFm').params), { title: 'Believer', artist: 'Imagine Dragons', page: 1 });
    await page.getByLabel('Titolo del brano').fill('not submitted');
    await page.getByRole('button', { name: 'Successiva' }).click();
    assert.equal(await page.evaluate(() => window.calls.findLast(c => c.method === 'searchLastFm').params.title), 'Believer');
    await page.getByRole('button', { name: 'Precedente' }).click();
    await page.getByRole('button', { name: 'Un titolo molto lungo', exact: false }).click();
    await page.getByText('Il collegamento YouTube non è disponibile.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Scarica sul telefono' }).count(), 0);
    await page.getByRole('button', { name: 'Apri su Last.fm' }).click();
    assert.equal(await page.evaluate(() => window.calls.findLast(c => c.method === 'openLastFmTrack').params.url.endsWith('/Other')), true);
    await page.getByRole('button', { name: 'Believer Imagine Dragons' }).click();
    const download = page.getByRole('button', { name: 'Scarica sul telefono' });
    await download.waitFor();
    assert.equal(await page.evaluate(() => window.calls.some(c => c.method === 'startMusicDownloads')), false);
    await page.evaluate(() => { window.downloadState.busy = true; document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByText('Un download è già in corso. Puoi continuare a cercare.').waitFor();
    assert.equal(await download.isDisabled(), true);
    await page.evaluate(() => { window.downloadState = { lastFmConfigured: true, canResume: true }; document.dispatchEvent(new Event('visibilitychange')); });
    const replace = page.getByRole('checkbox', { name: 'Sostituisci la coda interrotta', exact: false });
    await replace.waitFor(); assert.equal(await download.isDisabled(), true);
    await replace.check(); assert.equal(await download.isEnabled(), true);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 568 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow at ${width}px`);
      if (process.env.ONDA_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.ONDA_SCREENSHOT_DIR}/onda-search-${width}.png`, fullPage: true });
    }
    await download.click();
    await page.getByRole('heading', { name: 'Scarica musica.' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.findLast(c => c.method === 'startMusicDownloads').params), { url: 'https://www.youtube.com/watch?v=7wtfhZwyrcc', playlist: false, fromSearch: true, replaceInterrupted: true });
    await openSearch();
    await page.getByLabel('Titolo del brano').fill('vuoto');
    await page.getByRole('button', { name: 'Cerca brani' }).click();
    await page.getByText('Nessun brano trovato.', { exact: false }).waitFor();
    await page.getByLabel('Titolo del brano').fill('errore');
    await page.getByRole('button', { name: 'Cerca brani' }).click();
    await page.getByRole('alert').filter({ hasText: 'Ricerca non riuscita.' }).waitFor();
    assert.deepEqual(errors, []);
    console.log('Search UI passed: key setup, search/filter, pagination, missing video, browser link, busy/interrupted queue, explicit download, empty/error states, 390/320px.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
