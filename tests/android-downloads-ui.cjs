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
      window.calls = [];
      window.downloadState = {};
      window.OndaAndroid = { postMessage(raw) {
        const { id, method, params } = JSON.parse(raw); window.calls.push({ method, params });
        let result = null, error;
        if (method === 'library') result = { tracks: [], playlists: [] };
        else if (method === 'state') result = { currentId: null, playing: false, queue: [], shuffle: false, repeat: 0, volume: .7, position: 0, duration: 0 };
        else if (method === 'updateState') result = { phase: 'current', installedVersion: '1.2.3' };
        else if (method === 'musicDownloadState') result = window.downloadState;
        else if (method === 'configureMusicDownloads') {
          window.downloadState = { ...window.downloadState, lastFmConfigured: !params.clear }; result = window.downloadState;
        } else if (method === 'startMusicDownloads') {
          if (window.failNext) { window.failNext = false; error = 'Incolla un link HTTPS a un video YouTube'; }
          else {
            window.downloadState = { ...window.downloadState, url: params.url || window.downloadState.url, playlist: params.playlist ?? window.downloadState.playlist, busy: true, stage: 'downloading', percent: 42, current: 0, canResume: false,
              entries: [{ id: 'AbcDef123_-', title: 'Artista - Brano', status: 'working' }], added: 0, duplicates: 0, failed: 0 };
            result = window.downloadState;
          }
        } else if (method === 'cancelMusicDownloads') {
          window.downloadState = { ...window.downloadState, busy: false, stage: 'cancelled', percent: -1, canResume: true, message: 'Download annullato. Puoi riprendere i brani rimasti.', entries: window.downloadState.entries.map(e => ({ ...e, status: 'pending' })) };
          result = window.downloadState;
        }
        queueMicrotask(() => window.__ondaReply({ id, result, ...(error ? { error } : {}) }));
      } };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('heading', { name: 'La tua musica, oggi.' }).waitFor();
    await page.locator('[data-slot=sidebar-trigger]').click();
    await page.getByRole('button', { name: 'Scarica musica', exact: true }).click();
    await page.getByRole('heading', { name: 'Scarica musica.' }).waitFor();
    const link = page.getByLabel('Link YouTube');
    await link.fill('https://www.youtube.com/playlist?list=PLabcdefghijklm');
    assert.equal(await page.getByLabel('Scarica tutta la playlist').isChecked(), true);
    await page.getByRole('button', { name: 'Scarica sul telefono' }).click();
    await page.getByRole('heading', { name: 'Download audio' }).waitFor();
    assert.equal(await link.isDisabled(), true);
    assert.equal(await page.getByRole('progressbar').getAttribute('value'), '42');
    assert.equal(await page.evaluate(() => window.calls.findLast(c => c.method === 'startMusicDownloads').params.playlist), true);
    await page.getByRole('button', { name: 'Annulla download' }).click();
    await page.getByRole('button', { name: 'Riprendi i brani rimasti' }).click();
    await page.getByRole('heading', { name: 'Download audio' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.findLast(c => c.method === 'startMusicDownloads').params), { resume: true });
    await page.getByRole('button', { name: 'Annulla download' }).click();
    await page.getByText('Metadati Last.fm · facoltativi', { exact: true }).click();
    await page.getByLabel('Chiave API Last.fm').fill('a'.repeat(32));
    await page.getByRole('button', { name: 'Salva chiave' }).click();
    await page.getByText('Chiave Last.fm salvata sul telefono.').waitFor();
    assert.equal(await page.getByLabel('Chiave API Last.fm').inputValue(), '');
    assert.equal(await page.getByLabel('Chiave API Last.fm').getAttribute('type'), 'password');
    await page.getByRole('button', { name: 'Rimuovi chiave' }).click();
    await page.getByText('Chiave Last.fm rimossa.').waitFor();
    await link.fill('https://youtu.be/AbcDef123_-');
    assert.equal(await page.getByLabel('Scarica tutta la playlist').isChecked(), false);
    await page.evaluate(() => { window.failNext = true; });
    await page.getByRole('button', { name: 'Scarica sul telefono' }).click();
    await page.getByRole('alert').filter({ hasText: 'Incolla un link HTTPS' }).waitFor();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 568 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `Horizontal overflow at ${width}px`);
      if (process.env.ONDA_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.ONDA_SCREENSHOT_DIR}/onda-downloads-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('Download UI passed: empty library, video/playlist choice, progress, cancel/resume, Last.fm settings, errors, 390/320px layouts.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
