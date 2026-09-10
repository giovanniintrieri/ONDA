'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';

import {
  connectMediaSession,
  mediaSessionDebug,
  type MediaControls,
} from '@/lib/media-session';

type MediaTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
};

type Connection = {
  audio: HTMLAudioElement;
  session: MediaSession;
  disconnect: () => void;
  metadataKey: string | null;
};

export function useMediaSession(
  audioRef: RefObject<HTMLAudioElement | null>,
  track: MediaTrack | undefined,
  controls: MediaControls
) {
  const latestControls = useRef(controls);
  const connection = useRef<Connection | null>(null);

  useLayoutEffect(() => {
    latestControls.current = controls;
  }, [controls]);

  useEffect(() => {
    const audio = audioRef.current;
    const session =
      'mediaSession' in navigator
        ? navigator.mediaSession
        : null;

    let active = connection.current;

    if (!audio || !session) {
      active?.disconnect();
      connection.current = null;
      return;
    }

    if (
      !active ||
      active.audio !== audio ||
      active.session !== session
    ) {
      active?.disconnect();
      connection.current = null;

      active = {
        audio,
        session,
        disconnect: connectMediaSession(
          audio,
          session,
          () => latestControls.current
        ),
        metadataKey: null,
      };

      connection.current = active;

      console.info('[Onda][Media Session] collegata', {
        audioNelDOM: audio.isConnected,
        azioni: { ...mediaSessionDebug.actions },
      });
    }

    const metadataKey = JSON.stringify([
      track?.id,
      track?.title,
      track?.artist,
      track?.album,
    ]);

    if (active.metadataKey === metadataKey) return;

    try {
      if (!track?.id) {
        // Lo stato di riproduzione viene gestito dagli eventi audio.
        session.metadata = null;
      } else if (typeof MediaMetadata !== 'undefined') {
        session.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: [
            {
              src: new URL(
                '/icon-512.png',
                window.location.origin
              ).href,
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        });
      }

      active.metadataKey = metadataKey;
    } catch (error) {
      console.error(
        '[Onda][Media Session] metadati',
        error
      );
    }

    // Controlla il ref dopo ogni render.
    // Mantiene la connessione esistente se l'audio è lo stesso.
  });

  useEffect(() => {
    return () => {
      connection.current?.disconnect();
      connection.current = null;
    };
  }, []);
}