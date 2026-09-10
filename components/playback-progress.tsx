'use client';
import { useEffect, useState, type RefObject } from 'react';
import { Slider } from '@/components/ui/slider';
import { formatTime } from '@/lib/music';

// Keep frequent audio updates inside this small component, away from the library.
export function PlaybackProgress({ audioRef, currentId, duration, onSeek }: { audioRef: RefObject<HTMLAudioElement | null>; currentId: string | null; duration: number; onSeek: (value: number[]) => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => { if (!document.hidden) setElapsed(audio.currentTime || 0); };
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('seeked', update);
    document.addEventListener('visibilitychange', update);
    return () => { audio.removeEventListener('timeupdate', update); audio.removeEventListener('seeked', update); document.removeEventListener('visibilitychange', update); };
  }, [audioRef, currentId]);
  return <div className="progress-row"><span>{formatTime(elapsed)}</span><Slider aria-label="Posizione nel brano" min={0} max={duration || 1} step={0.1} value={[Math.min(elapsed, duration || 0)]} onValueChange={v => { onSeek(v); setElapsed(v[0]); }} disabled={!currentId || !duration} /><span>{formatTime(duration)}</span></div>;
}
