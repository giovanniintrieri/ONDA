const CACHE = 'onda-shell-__ONDA_CACHE_VERSION__';
const ORIGIN = self.location.origin;
const genericPage = response => response.ok && !response.redirected && new URL(response.url).origin === ORIGIN;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const manifest = await fetch('/precache.json', { cache: 'no-store', credentials: 'same-origin' });
      if (!genericPage(manifest)) throw new Error('Offline manifest unavailable');
      const { assets } = await manifest.json();
      for (const asset of assets) {
        if (new URL(asset, ORIGIN).origin !== ORIGIN) throw new Error('Invalid offline asset');
        const response = await fetch(asset, { credentials: 'same-origin', cache: 'reload' });
        if (!genericPage(response)) throw new Error('Offline asset unavailable');
        await cache.put(asset, response);
      }
      const page = await fetch('/', { credentials: 'same-origin', cache: 'reload', headers: { Accept: 'text/html' } });
      if (!genericPage(page)) throw new Error('App unavailable');
      const html = await page.clone().text();
      if (!html.includes('name="application-name" content="Onda"')) throw new Error('Not the Onda app');
      await cache.put('/', page);
    } catch (error) { await caches.delete(CACHE); throw error; }
    // The first install activates normally. Updates wait for old app tabs to close.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // An explicit update can leave older tabs open. Retain two prior shells so
    // their lazy-loaded audio readers remain available, with bounded storage.
    const previous = (await caches.keys()).filter(name => name.startsWith('onda-shell-') && name !== CACHE);
    for (const name of previous.slice(0, -2)) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.origin !== ORIGIN) return;
  if (event.data?.type === 'ONDA_VERSION') event.ports[0]?.postMessage({ version: CACHE.slice('onda-shell-'.length) });
  // Activate only after the listener has requested an update. Do not reload or
  // interrupt playback merely because a newer release has finished downloading.
  if (event.data?.type === 'ONDA_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // These routes belong to the hosting platform. Browser navigation must reach
  // its sign-in handler directly, without being converted to a worker fetch.
  if (event.request.method !== 'GET' || url.origin !== ORIGIN || ['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'].includes(url.pathname) || url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) return;
  // This route also works through the older cache-first worker: it was never
  // precached. Update checks and recovery must always reach the current release.
  if (['/aggiorna', '/precache.json', '/sw.js'].includes(url.pathname)) return;
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      // The shell contains no user data. Audio and personal state come from IndexedDB.
      return await cache.match('/') || fetch(event.request);
    })());
    return;
  }
  if (event.request.headers.get('RSC') || url.searchParams.has('_rsc')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const current = await cache.match(event.request, { ignoreSearch: false });
    if (current) return current;
    for (const name of (await caches.keys()).reverse()) {
      if (!name.startsWith('onda-shell-') || name === CACHE) continue;
      const previous = await (await caches.open(name)).match(event.request, { ignoreSearch: false });
      if (previous) return previous;
    }
    return fetch(event.request);
  })());
});
