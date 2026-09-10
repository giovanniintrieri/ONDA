import assert from 'node:assert/strict';
import test from 'node:test';
import { updatePage as html } from '../lib/update-page.ts';
import { MessageChannel } from 'node:worker_threads';
import vm from 'node:vm';

const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const version = 'aabbccdd11223344';

async function recover({ latestActive = false, updateFails = false } = {}) {
  const button = { disabled: false, textContent: '', addEventListener() {} };
  const status = { textContent: '' };
  let activations = 0, destination = null;
  const latest = {
    state: 'installed',
    postMessage(message, ports = []) {
      if (message.type === 'ONDA_VERSION') ports[0].postMessage({ version });
      if (message.type === 'ONDA_ACTIVATE_UPDATE') {
        activations++;
        latest.state = 'activated';
        registration.active = latest;
        registration.waiting = null;
        serviceWorker.controller = latest;
      }
    },
  };
  const old = { state: 'activated', postMessage(_message, ports) { ports[0].postMessage({ version: 'previous-version' }); } };
  const registration = {
    active: latestActive ? latest : old,
    waiting: latestActive ? null : latest,
    async update() { if (updateFails) throw new TypeError('Offline'); },
  };
  if (latestActive) latest.state = 'activated';
  const serviceWorker = {
    controller: registration.active,
    async register(url, options) {
      assert.equal(url, '/sw.js');
      assert.equal(options.scope, '/');
      assert.equal(options.updateViaCache, 'none');
      return registration;
    },
  };
  await vm.runInNewContext(source, {
    document: { getElementById: id => id === 'status' ? status : button },
    navigator: { serviceWorker },
    location: { replace(value) { destination = value; } },
    async fetch(url, options) {
      assert.match(url, /^\/precache\.json\?check=/);
      assert.equal(options.cache, 'no-store');
      return new Response(JSON.stringify({ version }));
    },
    MessageChannel, setTimeout, clearTimeout, TypeError,
  });
  return { activations, destination, button, status };
}

test('recovery activates the verified release even when an old tab still has a controller', async () => {
  const result = await recover();
  assert.equal(result.activations, 1);
  assert.equal(result.destination, '/');
});

test('opening recovery with the latest release returns to Onda without another activation', async () => {
  const result = await recover({ latestActive: true });
  assert.equal(result.activations, 0);
  assert.equal(result.destination, '/');
});

test('a failed update offers retry and does not navigate to an unverified release', async () => {
  const result = await recover({ updateFails: true });
  assert.equal(result.activations, 0);
  assert.equal(result.destination, null);
  assert.equal(result.button.disabled, false);
  assert.match(result.status.textContent, /connessione/);
});
