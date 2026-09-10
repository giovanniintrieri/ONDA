import assert from 'node:assert/strict';
import test from 'node:test';
import { connectMediaSession } from '../lib/media-session.ts';

class AudioFixture extends EventTarget {
  src = 'blob:local-song';
  paused = true;
  ended = false;
  error = null;
  duration = 180;
  currentTime = 36;
  playbackRate = 1;
  playCalls = 0;
  getAttribute(name) { return name === 'src' ? this.src : null; }
  emit(type) { this.dispatchEvent(new Event(type)); }
  play() { this.playCalls++; this.paused = false; this.ended = false; this.emit('play'); this.emit('playing'); }
  pause() { this.paused = true; this.emit('pause'); }
}

function setup(unsupported = []) {
  const audio = new AudioFixture();
  const handlers = new Map(), registrations = [];
  const session = {
    playbackState: 'none', metadata: null, position: undefined,
    setActionHandler(action, handler) {
      if (unsupported.includes(action)) throw new DOMException('Unsupported', 'NotSupportedError');
      registrations.push([action, handler]);
      if (handler) handlers.set(action, handler); else handlers.delete(action);
    },
    setPositionState(value) { this.position = value; },
  };
  const changes = [];
  let controls = {
    play: () => audio.play(),
    next: () => changes.push('original next'),
    previous: () => changes.push('previous'),
    seek: seconds => { audio.currentTime = seconds; audio.emit('seeked'); },
  };
  return { audio, session, handlers, registrations, changes,
    replaceNext(next) { controls = { ...controls, next }; },
    connect: () => connectMediaSession(audio, session, () => controls),
  };
}

test('OS playback state follows native audio events without a UI render or timer', () => {
  const { audio, session, connect } = setup();
  const disconnect = connect();
  assert.equal(session.playbackState, 'paused');
  audio.play();
  assert.equal(session.playbackState, 'playing');
  audio.currentTime = 78;
  audio.pause();
  assert.equal(session.playbackState, 'paused');
  assert.equal(session.position.position, 78);
  // An interruption (call, audio focus loss, headphone removal) must stay paused.
  audio.emit('loadedmetadata');
  assert.equal(audio.playCalls, 1);
  assert.equal(session.playbackState, 'paused');
  audio.play();
  audio.ended = true; audio.emit('ended');
  assert.equal(session.playbackState, 'paused');
  audio.error = { code: 3 }; audio.emit('error');
  assert.equal(session.playbackState, 'none');
  assert.equal(session.position, undefined);
  disconnect();
});

test('lock-screen controls use the latest queue without unregistering the active session', () => {
  const f = setup(), disconnect = f.connect();
  const registrations = f.registrations.length;
  f.audio.play();
  f.replaceNext(() => f.changes.push('updated next'));
  f.handlers.get('nexttrack')({});
  f.handlers.get('previoustrack')({});
  assert.deepEqual(f.changes, ['updated next', 'previous']);
  assert.equal(f.registrations.length, registrations);
  assert.equal(f.session.playbackState, 'playing');
  f.handlers.get('pause')({});
  assert.equal(f.audio.paused, true);
  f.handlers.get('play')({});
  assert.equal(f.audio.paused, false);
  disconnect();
  assert.equal(f.handlers.size, 0);
  assert.equal(f.session.playbackState, 'none');
  f.audio.emit('playing');
  assert.equal(f.session.playbackState, 'none');
});

test('lock-screen seeking clamps positions and rejects unavailable durations', () => {
  const f = setup(), disconnect = f.connect();
  f.handlers.get('seekto')({ seekTime: 300 });
  assert.equal(f.audio.currentTime, 180);
  f.handlers.get('seekbackward')({ seekOffset: 200 });
  assert.equal(f.audio.currentTime, 0);
  f.handlers.get('seekforward')({});
  assert.equal(f.audio.currentTime, 10);
  f.handlers.get('seekto')({ seekTime: NaN });
  assert.equal(f.audio.currentTime, 10);
  f.audio.duration = NaN; f.audio.emit('durationchange');
  assert.equal(f.session.position, undefined);
  f.handlers.get('seekto')({ seekTime: 20 });
  assert.equal(f.audio.currentTime, 10);
  f.audio.duration = 180; f.audio.currentTime = 500; f.audio.emit('seeked');
  assert.equal(f.session.position.position, 180);
  disconnect();
});

test('partial Media Session support never prevents basic playback', () => {
  const f = setup(['stop', 'seekto', 'seekbackward', 'seekforward']);
  f.session.setPositionState = undefined;
  const disconnect = f.connect();
  f.handlers.get('play')({});
  assert.equal(f.session.playbackState, 'playing');
  f.handlers.get('pause')({});
  assert.equal(f.session.playbackState, 'paused');
  disconnect();
});
