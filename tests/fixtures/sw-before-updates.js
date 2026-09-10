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
    for (const name of await caches.keys()) if (name.startsWith('onda-shell-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // These routes belong to the hosting platform. Browser navigation must reach
  // its sign-in handler directly, without being converted to a worker fetch.
  if (event.request.method !== 'GET' || url.origin !== ORIGIN || ['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'].includes(url.pathname) || url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) return;
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
    return await cache.match(event.request, { ignoreSearch: false }) || fetch(event.request);
  })());
});
