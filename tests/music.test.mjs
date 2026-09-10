import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { parseBlob } from 'music-metadata';
import { importTrack, loadLibrary, editTrack, readAudio, removeTrack, savePlaylist, removePlaylist, loadSetting, saveSetting } from '../lib/music.ts';
import { makeDemo, demoTags } from '../lib/demo.ts';

const now = 1800000000000;
const track = (id, overrides = {}) => ({ id, title: id, artist: `Artist ${id}`, album: '', genre: '', duration: 180, size: 5000, format: 'MP3', filename: `${id}.mp3`, addedAt: now, liked: false, plays: 0, skips: 0, lastPlayed: 0, ...overrides });

test('demo audio is a valid non-silent WAV with predictable duration and safe amplitude', async () => {
  for (let index = 0; index < 4; index++) {
    const f = makeDemo(index), metadata = await parseBlob(f);
    assert.equal(metadata.format.duration, 20);
    assert.equal(metadata.format.sampleRate, 22050);
    const view = new DataView(await f.arrayBuffer());
    let peak = 0; for (let offset = 44; offset < view.byteLength; offset += 2) peak = Math.max(peak, Math.abs(view.getInt16(offset, true)));
    assert.ok(peak > 1000 && peak < 26000);
  }
});
test('local storage preserves audio, deduplicates imports, serializes feedback and removes only requested data', async () => {
  const firstFile = makeDemo(0), secondFile = makeDemo(1);
  const first = await importTrack(firstFile, demoTags[0]);
  const second = await importTrack(secondFile, demoTags[1]);
  assert.ok(first && second);
  const audio = await readAudio(first.id);
  assert.deepEqual(new Uint8Array(await audio.arrayBuffer()), new Uint8Array(await firstFile.arrayBuffer()));
  await Promise.all([
    editTrack(first.id, t => ({ ...t, liked: true })),
    editTrack(first.id, t => ({ ...t, plays: t.plays + 1 })),
  ]);
  assert.equal(await importTrack(firstFile), null);
  let data = await loadLibrary();
  const updated = data.tracks.find(t => t.id === first.id);
  assert.equal(updated.liked, true);
  assert.equal(updated.plays, 1);
  assert.equal(data.tracks.length, 2);
  await savePlaylist({ id: 'p', name: 'Test', trackIds: [first.id, second.id], createdAt: now });
  await removeTrack(first.id);
  data = await loadLibrary();
  assert.deepEqual(data.tracks.map(t => t.id), [second.id]);
  assert.deepEqual(data.playlists[0].trackIds, [second.id]);
  await assert.rejects(readAudio(first.id));
  await removePlaylist('p');
  assert.equal((await loadLibrary()).tracks.length, 1);
  await removeTrack(second.id);
});

test('custom listening rules survive storage and reject invalid audio without altering the library', async () => {
  const value = { mode: 'custom', algorithm: { name: 'Il mio mix', method: 'rules', rules: [{ id: 'favorite', feature: 'preferito', weight: 8 }], formula: 'preferito * 8' } };
  await saveSetting('listening', value);
  assert.deepEqual(await loadSetting('listening'), value);
  await assert.rejects(importTrack(new File(['not audio'], 'broken.mp3', { type: 'audio/mpeg' })));
  assert.equal((await loadLibrary()).tracks.length, 0);
});
