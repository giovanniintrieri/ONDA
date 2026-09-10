export const mediaSessionDebug = {
  connected: false,
  actions: {} as Partial<Record<MediaSessionAction, string>>,
  lastAction: 'nessuno',
  lastError: '',
};


export type MediaControls = {
  play: () => void;
  pause?: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
};

export function connectMediaSession(
  audio: HTMLAudioElement,
  session: MediaSession,
  controls: () => MediaControls
) {
  mediaSessionDebug.connected = true;
mediaSessionDebug.actions = {};
  function sync() {
    const available =
      !!audio.getAttribute('src') && !audio.error;

    const state: MediaSessionPlaybackState =
      !available
        ? 'none'
        : audio.paused || audio.ended
          ? 'paused'
          : 'playing';

    try {
      if (session.playbackState !== state) {
        session.playbackState = state;
      }
    } catch {
      // Integrazione opzionale del browser.
    }

    if (typeof session.setPositionState !== 'function') return;

    try {
      if (
        !available ||
        !Number.isFinite(audio.duration) ||
        audio.duration <= 0 ||
        !Number.isFinite(audio.playbackRate) ||
        audio.playbackRate === 0
      ) {
        session.setPositionState();
      } else {
        session.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: Math.max(
            0,
            Math.min(
              Number.isFinite(audio.currentTime)
                ? audio.currentTime
                : 0,
              audio.duration
            )
          ),
        });
      }
    } catch {
      // Alcuni browser espongono l'API solo parzialmente.
    }
  }

  function seek(seconds: number) {
    if (
      !Number.isFinite(seconds) ||
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0
    ) {
      return;
    }

    controls().seek(
      Math.max(0, Math.min(seconds, audio.duration))
    );

    sync();
  }

  const handlers: [
    MediaSessionAction,
    MediaSessionActionHandler
  ][] = [
    ['play', () => controls().play()],
    ['pause', () => {
      const current = controls();
      if (current.pause) current.pause();
      else audio.pause();
    }],
    ['previoustrack', () => controls().previous()],
    ['nexttrack', () => controls().next()],
    ['seekto', details => {
      if (details.seekTime !== undefined) {
        seek(details.seekTime);
      }
    }],
  ];

  const registered = new Set<MediaSessionAction>();

  function register() {
    const disabled: MediaSessionAction[] = [
      'stop',
      'seekbackward',
      'seekforward',
    ];

    for (const action of disabled) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // Azione non supportata.
      }
    }

for (const [action, handler] of handlers) {
  try {
    session.setActionHandler(action, details => {
      mediaSessionDebug.lastAction = action;
      mediaSessionDebug.lastError = '';

      try {
        handler(details);
      } catch (error) {
        mediaSessionDebug.lastError = String(error);
        console.error('[Onda][comando esterno]', action, error);
      }
    });

    registered.add(action);
    mediaSessionDebug.actions[action] = 'accettato dal browser';
  } catch (error) {
    mediaSessionDebug.actions[action] = `rifiutato: ${String(error)}`;
    console.error('[Onda][registrazione comando]', action, error);
  }
}

    sync();
  }

  const events = [
    'play',
    'playing',
    'pause',
    'ended',
    'emptied',
    'error',
    'loadedmetadata',
    'durationchange',
    'ratechange',
    'seeked',
  ];

  for (const event of events) {
    audio.addEventListener(event, sync);
  }

  audio.addEventListener('playing', register);
  register();

  return () => {
    mediaSessionDebug.connected = false;
    for (const event of events) {
      audio.removeEventListener(event, sync);
    }

    audio.removeEventListener('playing', register);

    for (const action of registered) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // Azione opzionale.
      }
    }

    try {
      session.metadata = null;
      session.playbackState = 'none';
      session.setPositionState?.();
    } catch {
      // API opzionale.
    }
  };
}