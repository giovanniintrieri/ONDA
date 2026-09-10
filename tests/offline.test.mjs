import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { updatePage } from '../lib/update-page.ts';

const root = path.resolve('dist/client');
const origin = 'https://onda.test';
const workerSource = await readFile(path.join(root, 'sw.js'), 'utf8');
const manifest = JSON.parse(await readFile(path.join(root, 'precache.json'), 'utf8'));

function harness({ login = false, source = workerSource, stores = new Map() } = {}) {
  const handlers = new Map(); let offline = false, activations = 0;
  const normalize = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { async put(request, response) { store.set(normalize(request), response.clone()); }, async match(request) { return store.get(normalize(request))?.clone(); } };
    },
    async delete(name) { return stores.delete(name); }, async keys() { return [...stores.keys()]; },
  };
  const fetch = async request => {
    if (offline) throw new TypeError('Offline');
    const url = new URL(typeof request === 'string' ? request : request.url, origin);
    const body = url.pathname === '/' ? login ? '<html>Please sign in</html>' : '<html><meta name="application-name" content="Onda"><body>Onda</body></html>' : url.pathname === '/aggiorna' ? updatePage : await readFile(path.join(root, url.pathname));
    const response = new Response(body);
    Object.defineProperty(response, 'url', { value: url.href });
    return response;
  };
  vm.runInNewContext(source, { self: { location: { origin }, async skipWaiting() { activations++; }, clients: { async claim() {} }, addEventListener: (name, handler) => handlers.set(name, handler) }, caches, fetch, URL });
  return {
    stores, get activations() { return activations; }, setOffline() { offline = true; },
    async event(name, details = {}) { let work; handlers.get(name)({ ...details, waitUntil(promise) { work = promise; } }); return work; },
    async request(pathname, mode = 'cors', headers = new Headers()) {
      let work; handlers.get('fetch')({ request: { url: new URL(pathname, origin).href, method: 'GET', mode, headers }, respondWith(promise) { work = promise; } }); return work;
    },
  };
}

test('offline manifest contains the metadata reader and every emitted JavaScript chunk', async () => {
  assert.ok(manifest.assets.length > 10);
  assert.ok(manifest.assets.some(asset => asset.endsWith('.webmanifest')));
  assert.ok(manifest.assets.some(asset => asset.includes('MpegParser')));
  for (const asset of manifest.assets) assert.ok((await stat(path.join(root, asset))).isFile());
  assert.doesNotMatch(workerSource, /__ONDA_CACHE_VERSION__/);
});
test('fresh offline navigation and all precached assets are served after successful installation', async () => {
  const app = harness();
  await app.event('install'); await app.event('activate'); app.setOffline();
  const page = await app.request('/', 'navigate');
  assert.match(await page.text(), /application-name/);
  for (const asset of manifest.assets) assert.equal((await app.request(asset)).status, 200);
  assert.equal(await app.request('/api/private'), undefined);
  for (const route of ['/callback?code=example&state=example', '/signin-with-chatgpt?return_to=%2F', '/signout-with-chatgpt']) {
    assert.equal(await app.request(route, 'navigate'), undefined);
  }
  assert.equal(await app.request('https://other.test/audio.mp3'), undefined);
  assert.equal(await app.request('/?_rsc=token', 'cors', new Headers({ RSC: '1' })), undefined);
});
test('a login response does not become the offline app and failed installations are removed', async () => {
  const app = harness({ login: true });
  await assert.rejects(app.event('install'), /Not the Onda app/);
  assert.equal(app.stores.size, 0);
});


test('a legacy cached app can reach the recovery page without clearing its stored data', async () => {
  const source = (await readFile('tests/fixtures/sw-before-updates.js', 'utf8')).replaceAll('__ONDA_CACHE_VERSION__', 'legacy');
  const app = harness({ source });
  await app.event('install'); await app.event('activate');
  const cachedPage = await app.request('/', 'navigate');
  assert.doesNotMatch(await cachedPage.text(), /Aggiorniamo Onda/);
  const recovery = await app.request('/aggiorna', 'navigate');
  assert.match(await recovery.text(), /Aggiorniamo Onda/);
  assert.ok(app.stores.has('onda-shell-legacy'));
});

test('updates report their version and activate only on an explicit same-origin request', async () => {
  const app = harness();
  await app.event('install');
  assert.equal(app.activations, 0);
  let reply;
  await app.event('message', { origin, data: { type: 'ONDA_VERSION' }, ports: [{ postMessage(value) { reply = value; } }] });
  assert.equal(reply.version, manifest.version);
  assert.equal(app.activations, 0);
  await app.event('message', { origin: 'https://other.test', data: { type: 'ONDA_ACTIVATE_UPDATE' } });
  assert.equal(app.activations, 0);
  await app.event('message', { origin, data: { type: 'ONDA_ACTIVATE_UPDATE' } });
  assert.equal(app.activations, 1);
});

test('activation keeps prior lazy-loaded audio assets with bounded shell storage', async () => {
  const stores = new Map([
    ['other-app', new Map()],
    ['onda-shell-obsolete', new Map()],
    ['onda-shell-previous-2', new Map()],
    ['onda-shell-previous-1', new Map([[origin + '/assets/old-reader.js', new Response('old audio reader')]])],
  ]);
  const app = harness({ stores });
  await app.event('install'); await app.event('activate'); app.setOffline();
  assert.equal(stores.size, 4);
  assert.ok(stores.has('other-app'));
  assert.ok(!stores.has('onda-shell-obsolete'));
  assert.equal(await (await app.request('/assets/old-reader.js')).text(), 'old audio reader');
  assert.match(await (await app.request('/', 'navigate')).text(), /application-name/);
  for (const route of ['/aggiorna', '/sw.js', '/precache.json?check=123']) {
    assert.equal(await app.request(route, 'navigate'), undefined);
  }
});
