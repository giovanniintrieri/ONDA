import assert from 'node:assert/strict';
import test from 'node:test';

test('production entry renders the music app in Italian without exposing server storage routes', async () => {
  const { default: worker } = await import('../dist/server/index.js');
  assert.equal(typeof worker.fetch, 'function');
  const response = await worker.fetch(new Request('http://localhost/', { headers: { accept: 'text/html' } }), { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /lang="it"/);
  assert.match(html, /Onda/);
  assert.match(html, /name="application-name" content="Onda"/);
  const manifests = html.match(/<link\b[^>]*rel="manifest"[^>]*>/gi) || [];
  assert.equal(manifests.length, 1);
  assert.match(manifests[0], /href="\/manifest.webmanifest"/);
  assert.match(manifests[0], /crossorigin="use-credentials"/i);
  assert.match(html, /Il tuo algoritmo/);
  assert.match(html, /Importa musica/);
  assert.doesNotMatch(html, /Starter Project|codex-preview|Ship something/);
});


test('missing pages offer a plain same-origin route back to the app without handling authentication', async () => {
  const { default: worker } = await import('../dist/server/index.js');
  const response = await worker.fetch(new Request('http://localhost/pagina-inesistente', { headers: { accept: 'text/html' } }), { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /Apri Onda/);
  assert.match(html, /href="\/"/);
});


test('recovery is available at an uncached same-origin route', async () => {
  const { default: worker } = await import('../dist/server/index.js');
  const response = await worker.fetch(new Request('http://localhost/aggiorna'), {
    ASSETS: { fetch: async () => { throw new Error('Recovery must not depend on static assets or cached app bundles'); } },
  }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Content-Type'), /text\/html/);
  assert.match(await response.text(), /Aggiorniamo Onda/);
});
