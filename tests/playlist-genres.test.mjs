import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../mobile/playlist-genres.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
const { playlistGenres, playlistTrackIds } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('I generi ignorano maiuscole e spazi senza inventare categorie per i brani non classificati', () => {
  const tracks = [{ id: 'a', genre: ' Rock ' }, { id: 'b', genre: 'ROCK' },
    { id: 'c', genre: 'Alternative   Metal' }, { id: 'd', genre: null }, { id: 'e', genre: '' }, { id: 'f' }];
  assert.deepEqual(playlistGenres(tracks), [
    { key: 'alternative metal', label: 'Alternative Metal', count: 1 },
    { key: 'rock', label: 'Rock', count: 2 },
  ]);
  assert.deepEqual(playlistTrackIds(tracks, ['rock']), ['a', 'b']);
  assert.deepEqual(playlistTrackIds(tracks, ['Alternative Metal']), ['c']);
});

test('Più generi producono una playlist unica; il brano di partenza compare una sola volta', () => {
  const tracks = [{ id: 'a', genre: 'Rock' }, { id: 'b', genre: 'Jazz' }, { id: 'c', genre: 'Pop' }, { id: 'a', genre: 'Rock' }];
  assert.deepEqual(playlistTrackIds(tracks, ['rock', 'jazz']), ['a', 'b']);
  assert.deepEqual(playlistTrackIds(tracks, ['rock', 'jazz'], 'a'), ['a', 'b']);
  assert.deepEqual(playlistTrackIds(tracks, ['rock'], 'c'), ['c', 'a']);
  assert.equal(playlistGenres(tracks).find(g => g.key === 'rock').count, 1);
});

test('Resta possibile creare una playlist vuota o con il solo brano scelto', () => {
  const tracks = [{ id: 'a', genre: 'Rock' }];
  assert.deepEqual(playlistTrackIds(tracks, []), []);
  assert.deepEqual(playlistTrackIds(tracks, [], 'a'), ['a']);
  assert.deepEqual(playlistTrackIds(tracks, ['jazz'], 'removed'), []);
  assert.deepEqual(playlistGenres([]), []);
});

test('I nomi composti restano integri e la playlist salvata è una selezione statica', () => {
  const tracks = [{ id: 'a', genre: 'Pop/Rock' }, { id: 'b', genre: 'R&B' }];
  const saved = playlistTrackIds(tracks, ['pop/rock']);
  assert.deepEqual(saved, ['a']);
  assert.deepEqual(playlistTrackIds(tracks, ['rock']), []);
  assert.deepEqual(playlistTrackIds(tracks, ['r&b']), ['b']);
  tracks.push({ id: 'c', genre: 'Pop/Rock' });
  assert.deepEqual(saved, ['a']);
  assert.deepEqual(playlistTrackIds(tracks, ['pop/rock']), ['a', 'c']);
});
