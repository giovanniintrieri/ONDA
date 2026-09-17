'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown, Heart, House, Library, ListMusic,
  Loader2, Menu, Pause, Play, Volume2, VolumeX,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { useSidebar } from '@/components/ui/sidebar';
import { Slider } from '@/components/ui/slider';
import { PlaybackProgress } from './playback-progress';
import { usePosition } from './player';

type Props = {
  current?: { id: string; title: string; artist: string; liked: boolean };
  playing: boolean;
  loading: boolean;
  duration: number;
  volume: number;
  view: string;
  artwork: ReactNode;
  largeArtwork: ReactNode;
  controls: ReactNode;
  onNavigate: (view: string) => void;
  onTogglePlay: () => void;
  onToggleLike: () => void;
  onSeek: (value: number[]) => void;
  onVolumeChange: (value: number) => void;
  onOpenQueue: (opener: HTMLButtonElement | null) => void;
};

function MiniProgress({ duration }: { duration: number }) {
  const position = usePosition();
  const progress = duration > 0
    ? Math.max(0, Math.min(1, position / duration))
    : 0;

  return (
    <div className="onda-mini-progress" aria-hidden="true">
      <span style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

const destinations = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'library', label: 'Libreria', icon: Library },
  { id: 'favorites', label: 'Preferiti', icon: Heart },
];

export function MobilePlayer(props: Props) {
  const { current, playing, loading, duration, volume, view } = props;
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
  const [expanded, setExpanded] = useState(false);
  const dock = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const openQueueAfterClose = useRef(false);

  useEffect(() => {
    if (!current) setExpanded(false);
  }, [current]);

  useEffect(() => {
    const element = dock.current;
    if (!element) return;

    const measure = () => {
      document.documentElement.style.setProperty(
        '--onda-mobile-dock-height',
        `${Math.ceil(element.getBoundingClientRect().height)}px`,
      );
    };

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(
        '--onda-mobile-dock-height',
      );
    };
  }, []);

  const likeLabel = current?.liked
    ? 'Rimuovi dai preferiti'
    : 'Aggiungi ai preferiti';

  const playLabel = loading
    ? 'Annulla caricamento'
    : playing ? 'Pausa' : 'Riproduci';

  const likeButton = (
    <button
      type="button"
      className="onda-touch-button"
      aria-label={likeLabel}
      aria-pressed={!!current?.liked}
      onClick={props.onToggleLike}
    >
      <Heart
        size={22}
        fill={current?.liked ? 'currentColor' : 'none'}
      />
    </button>
  );

  return (
    <>
      <div ref={dock} className="onda-mobile-dock">
        {current && (
          <section
            className="onda-mini-player"
            aria-label="Lettore musicale"
          >
            <button
              ref={opener}
              type="button"
              className="onda-mini-track"
              aria-label={`Apri il lettore: ${current.title}, ${current.artist}`}
              aria-haspopup="dialog"
              aria-expanded={expanded}
              aria-controls="onda-now-playing"
              onClick={() => setExpanded(true)}
            >
              {props.artwork}
              <span className="onda-mini-text">
                <strong>{current.title}</strong>
                <span>{current.artist}</span>
              </span>
            </button>

            {likeButton}

            <button
              type="button"
              className="onda-touch-button onda-mini-play"
              aria-label={playLabel}
              onClick={props.onTogglePlay}
            >
              {loading
                ? <Loader2 size={24} className="spin" />
                : playing
                  ? <Pause size={24} fill="currentColor" />
                  : <Play size={24} fill="currentColor" />}
            </button>

            <MiniProgress duration={duration} />
          </section>
        )}

        {isMobile && (
          <nav
            className="onda-bottom-nav"
            aria-label="Navigazione principale"
          >
            {destinations.map(item => (
              <button
                key={item.id}
                type="button"
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => props.onNavigate(item.id)}
              >
                <item.icon size={22} />
                <span>{item.label}</span>
              </button>
            ))}

            <button
              type="button"
              aria-label="Menu e playlist"
              aria-haspopup="dialog"
              aria-expanded={openMobile}
              onClick={toggleSidebar}
            >
              <Menu size={22} />
              <span>Menu</span>
            </button>
          </nav>
        )}
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          id="onda-now-playing"
          className="onda-now-playing-dialog"
          showCloseButton={false}
          onCloseAutoFocus={event => {
            event.preventDefault();

            const target = opener.current?.getClientRects().length
              ? opener.current
              : document.querySelector<HTMLButtonElement>(
                  '.player .main-play',
                );

            if (openQueueAfterClose.current) {
              openQueueAfterClose.current = false;
              props.onOpenQueue(target);
            } else {
              target?.focus();
            }
          }}
        >
          <header className="onda-player-heading">
            <button
              type="button"
              className="onda-touch-button"
              aria-label="Riduci il lettore"
              onClick={() => setExpanded(false)}
            >
              <ChevronDown size={28} />
            </button>
            <DialogTitle>In riproduzione</DialogTitle>
          </header>

          <DialogDescription className="sr-only">
            Controlli di riproduzione, avanzamento, volume e coda.
          </DialogDescription>

          <div className="onda-player-body">
            <div className="onda-player-cover">
              {props.largeArtwork}
            </div>

            <div className="onda-player-panel">
              <div className="onda-player-track">
                <div>
                  <h2>{current?.title}</h2>
                  <p>{current?.artist}</p>
                </div>
                {likeButton}
              </div>

              <PlaybackProgress
                currentId={current?.id ?? null}
                duration={duration}
                onSeek={props.onSeek}
              />

              {props.controls}

              <div className="onda-player-volume">
                <button
                  type="button"
                  className="onda-touch-button"
                  aria-label={
                    volume === 0 ? 'Attiva audio' : 'Disattiva audio'
                  }
                  onClick={() => {
                    props.onVolumeChange(volume === 0 ? 0.7 : 0);
                  }}
                >
                  {volume === 0
                    ? <VolumeX size={22} />
                    : <Volume2 size={22} />}
                </button>

                <Slider
                  aria-label="Volume"
                  min={0}
                  max={1}
                  step={0.01}
                  value={[volume]}
                  onValueChange={value => {
                    props.onVolumeChange(value[0]);
                  }}
                />
              </div>

              <button
                type="button"
                className="button outline onda-player-queue"
                aria-haspopup="dialog"
                onClick={() => {
                  openQueueAfterClose.current = true;
                  setExpanded(false);
                }}
              >
                <ListMusic size={22} />
                Coda e canzoni
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}