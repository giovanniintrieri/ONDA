import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticTracks, duplicateGroups } from '../mobile/library-insights.ts';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const day = 86_400_000, now = 100 * day;
const track = (id, extra = {}) => ({ id, title: 'Song', artist: 'Artist', duration: 180, addedAt: now, plays: 0, lastPlayed: 0, ...extra });

test('automatic playlists use real listening statistics, date boundaries and their own order', () => {
  const tracks = [track('new'), track('old', { addedAt: now - 31 * day, plays: 5, lastPlayed: now - 40 * day }),
    track('popular', { plays: 8, lastPlayed: now - day }), track('boundary', { addedAt: now - 30 * day, plays: 1, lastPlayed: now - 30 * day }),
    track('invalid-history', { plays: 2, lastPlayed: 0, addedAt: now - 31 * day })];
  const ids = id => automaticTracks(tracks, id, now).map(t => t.id);
  assert.deepEqual(ids('auto:unplayed'), ['new']);
  assert.deepEqual(ids('auto:most'), ['popular', 'old', 'invalid-history', 'boundary']);
  assert.deepEqual(ids('auto:forgotten'), ['old']);
  assert.deepEqual(ids('auto:recent'), ['new', 'popular', 'boundary']);
  tracks[0].plays = 1; tracks[0].lastPlayed = now;
  assert.deepEqual(ids('auto:unplayed'), []);
  assert.deepEqual(automaticTracks([], 'auto:most', now), []);
  assert.equal(automaticTracks(Array.from({ length: 80 }, (_, i) => track(String(i), { plays: i + 1 })), 'auto:most', now).length, 50);
});

test('automatic playlists do not duplicate or mutate the library', () => {
  const a = track('a'), b = track('b', { plays: 1 });
  const tracks = [b, a, a];
  assert.deepEqual(automaticTracks(tracks, 'auto:unplayed', now), [a]);
  assert.deepEqual(tracks, [b, a, a]);
});

test('duplicates normalize text but preserve versions and reject missing metadata', () => {
  const groups = duplicateGroups([track('a'), track('b', { title: ' SONG ', artist: 'ARTIST', duration: 182 }),
    track('live', { title: 'Song (Live)' }), track('other', { artist: 'Other Artist' }),
    track('unknown1', { artist: 'Artista sconosciuto' }), track('unknown2', { artist: 'Artista sconosciuto' }),
    track('zero', { duration: 0 }), track('nan', { duration: NaN }), track('a')]);
  assert.deepEqual(groups.map(g => g.map(t => t.id)), [['a', 'b']]);
});

test('duplicate groups never chain durations beyond two seconds', () => {
  const tracks = [track('a', { duration: 180 }), track('b', { duration: 182 }), track('c', { duration: 184 }), track('d', { duration: 185 })];
  assert.deepEqual(duplicateGroups(tracks).map(g => g.map(t => t.id)), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(tracks.map(t => t.id), ['a', 'b', 'c', 'd']);
});

test('native smart shuffle and duplicate rules pass JVM behavioral checks', () => {
  const out = mkdtempSync(join(tmpdir(), 'onda-library-'));
  try {
    execFileSync('java', ['-m', 'jdk.compiler/com.sun.tools.javac.Main', '-d', out, 'android/app/src/main/java/it/onda/player/QueueOrder.java',
      'android/app/src/main/java/it/onda/player/DuplicateRules.java', 'tests/java/LibraryRulesCheck.java'], { cwd: new URL('..', import.meta.url) });
    assert.match(execFileSync('java', ['-cp', out, 'it.onda.player.LibraryRulesCheck'], { encoding: 'utf8' }), /Library rules passed/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
