import { useEffect, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { formatTime } from './music';
import { usePosition } from './player';
export function PlaybackProgress({ currentId, duration, onSeek }: { currentId: string | null; duration: number; onSeek: (value: number[]) => void }) {
  const elapsed = usePosition();
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => setDraft(null), [currentId]);
  return <div className="progress-row"><span>{formatTime(draft ?? elapsed)}</span><Slider aria-label="Posizione nel brano" min={0} max={duration || 1} step={0.1} value={[Math.min(draft ?? elapsed, duration || 0)]} onValueChange={v => setDraft(v[0])} onValueCommit={v => { onSeek(v); setDraft(null); }} disabled={!currentId || !duration} /><span>{formatTime(duration)}</span></div>;
}
