import assert from 'node:assert/strict';
import test from 'node:test';
import { nextQueuedTrack, playbackOrder, seededRandom } from '../lib/algorithm.ts';

const songs = Array.from({ length: 15 }, (_, i) => `song-${i}`);

test('fifteen successive shuffled tracks are all different, including with an adversarial random source', () => {
  for (const rng of [() => 0, () => 0.999999, seededRandom(18)]) {
    let order = playbackOrder(songs, true, 'song-7', rng);
    let current = order[0];
    const heard = [current];
    for (let i = 1; i < songs.length; i++) {
      const next = nextQueuedTrack(order, current, false, true, () => { throw new Error('Must not draw another random track during a cycle'); });
      order = next.order;
      current = next.id;
      heard.push(current);
    }
    assert.equal(heard[0], 'song-7');
    assert.equal(new Set(heard).size, 15);
    assert.deepEqual(new Set(heard), new Set(songs));
    assert.equal(nextQueuedTrack(order, current, false, true).id, null);
  }
});

test('repeat-all visits each track once per shuffled cycle and never repeats across the boundary', () => {
  const rng = seededRandom(927);
  let order = playbackOrder(songs, true, null, rng), current = null, previous = null;
  for (let cycle = 0; cycle < 20; cycle++) {
    const heard = [];
    for (let i = 0; i < songs.length; i++) {
      const next = nextQueuedTrack(order, current, true, true, rng);
      order = next.order;
      current = next.id;
      assert.notEqual(current, previous);
      heard.push(current);
      previous = current;
    }
    assert.deepEqual(new Set(heard), new Set(songs));
    assert.equal(new Set(heard).size, 15);
  }
});

test('a reshuffle that draws the previous last track first is corrected without dropping it', () => {
  const draws = [0, 0.99, 0];
  const next = nextQueuedTrack(['a', 'b', 'c'], 'c', true, true, () => draws.shift());
  assert.notEqual(next.id, 'c');
  assert.deepEqual(new Set(next.order), new Set(['a', 'b', 'c']));
});

test('queue order stays fixed while skipping or returning to an earlier track', () => {
  const order = playbackOrder(songs, true, null, seededRandom(2));
  for (let position = 1; position < order.length; position++) {
    const previous = order[position - 1];
    const forward = nextQueuedTrack(order, previous, false, true);
    assert.equal(forward.id, order[position]);
    assert.deepEqual(forward.order, order);
  }
});

test('adding or removing a queued track does not restart the shuffled cycle', () => {
  const order = playbackOrder(songs, true, null, seededRandom(28));
  const heard = order.slice(0, 4), removed = order[7];
  let edited = [...order.filter(id => id !== removed), 'new-song'], current = heard.at(-1);
  while (true) {
    const next = nextQueuedTrack(edited, current, false, true);
    if (!next.id) break;
    current = next.id;
    edited = next.order;
    heard.push(current);
  }
  assert.equal(new Set(heard).size, heard.length);
  assert.ok(!heard.includes(removed));
  assert.equal(heard.at(-1), 'new-song');
});

test('ordinary ordering, duplicate IDs, empty queues, and one-song repeat remain well-defined', () => {
  const original = ['a', 'b', 'c'];
  assert.deepEqual(playbackOrder(original, false, 'b'), original);
  assert.deepEqual(original, ['a', 'b', 'c']);
  assert.deepEqual(playbackOrder(['a', 'a', 'b'], true, 'a', () => 0), ['a', 'b']);
  assert.equal(nextQueuedTrack(original, 'c', true, false).id, 'a');
  assert.equal(nextQueuedTrack(original, 'c', false, false).id, null);
  assert.equal(nextQueuedTrack([], null, true, true).id, null);
  assert.equal(nextQueuedTrack(['only'], 'only', false, true).id, null);
  assert.equal(nextQueuedTrack(['only'], 'only', true, true).id, 'only');
});
