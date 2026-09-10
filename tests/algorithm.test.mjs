import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, selectTracks, compileFormula } from '../lib/algorithm.ts';
const now = 1800000000000;
const track = (id, overrides = {}) => ({ id, title: id, artist: `Artist ${id}`, album: '', genre: '', duration: 180, size: 5000, format: 'MP3', filename: `${id}.mp3`, addedAt: now, liked: false, plays: 0, skips: 0, lastPlayed: 0, ...overrides });
const rules = entries => ({ mode: 'custom', algorithm: { name: 'Test', method: 'rules', rules: entries.map(([feature, weight], i) => ({ id: String(i), feature, weight })), formula: '' } });

test('random selection contains every actual track exactly once and ignores preferences', () => {
  const tracks = [track('a'), track('b'), track('c')];
  const random = { ...DEFAULT_SETTINGS, mode: 'random' };
  const selected = selectTracks(tracks, random, 72, now);
  assert.equal(selected.length, 3);
  assert.deepEqual(new Set(selected.map(r => r.track.id)), new Set(['a', 'b', 'c']));
  assert.deepEqual(selectTracks(tracks.map(t => ({ ...t, liked: true, skips: 99 })), random, 72, now).map(r => r.track.id), selected.map(r => r.track.id));
});
test('changing rule weights reverses preference; recent listening and skips are penalized', () => {
  const input = [track('favorite', { liked: true }), track('fresh')];
  assert.equal(selectTracks(input, rules([['preferito', 8]]), 1, now)[0].track.id, 'favorite');
  assert.equal(selectTracks(input, rules([['preferito', -8]]), 1, now)[0].track.id, 'fresh');
  const recent = track('recent', { plays: 1, lastPlayed: now });
  assert.equal(selectTracks([recent, track('fresh'), track('skipped', { skips: 10 })], DEFAULT_SETTINGS, 1, now)[0].track.id, 'fresh');
});
test('artist and genre affinity use feedback from other tracks', () => {
  const favorite = track('f', { artist: 'Marea', genre: 'Ambient', liked: true });
  const related = track('r', { artist: 'Marea', genre: 'Ambient' });
  const selected = selectTracks([favorite, related, track('other')], rules([['artista', 5], ['genere', 5]]), 1, now);
  assert.equal(selected[0].track.id, 'r');
  assert.equal(selected.find(r => r.track.id === 'f').values.artista, 0);
});
test('the formula parser honors arithmetic precedence and cannot execute JavaScript', () => {
  const values = { preferito: 1, artista: 0.5, genere: 0, nuovo: 1, recente: 0, ascolti: 4, salti: 12, giorni: 10, durata: 180, casuale: 0.4 };
  assert.equal(compileFormula('preferito * 5 - min(salti, 8) * 2')(values), -11);
  assert.equal(compileFormula('-2^2 + 2^3^2')(values), 508);
  for (const source of ['window.alert(1)', 'constructor(1)', 'fetch(1)', '1; 2', '1 +', 'min(1)', '('.repeat(40) + '1' + ')'.repeat(40)]) assert.throws(() => compileFormula(source));
  assert.throws(() => compileFormula('1 / 0')(values));
  assert.throws(() => compileFormula('sqrt(-1)')(values));
});
test('preview and playback score the same saved formula; empty libraries stay empty', () => {
  const settings = { mode: 'custom', algorithm: { name: 'Formula', method: 'formula', rules: [], formula: 'preferito * 9 - salti' } };
  const selected = selectTracks([track('a'), track('b', { liked: true, skips: 2 })], settings, 7291, now);
  assert.equal(selected[0].track.id, 'b');
  assert.equal(selected[0].score, 7);
  assert.equal(selectTracks([], DEFAULT_SETTINGS).length, 0);
});
