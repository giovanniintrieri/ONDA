'use client';

import { mediaSessionDebug } from '@/lib/media-session';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, AudioLines, Check, ChevronRight, Clock3, FolderHeart, FolderOpen, HardDrive, Heart, Headphones, Library, ListMusic, Loader2, MoreHorizontal, Pause, Play, Plus, Repeat, Repeat1, Search, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { coverColor, editTrack, formatSize, formatTime, importTrack, isAudio, loadLibrary, readAudio, removePlaylist, removeTrack, savePlaylist, type Playlist, type Track } from '@/lib/music';
import { demoTags, makeDemo } from '@/lib/demo';

import { DEFAULT_SETTINGS, nextQueuedTrack, playbackOrder, randomSeed, selectTracks, validateAlgorithm, type ListeningSettings, type Selection } from '@/lib/algorithm';
import { loadSetting, saveSetting } from '@/lib/music';
import { AlgorithmEditor } from '@/components/algorithm-editor';
import { DeviceSetup } from '@/components/device-setup';
import { PlaybackProgress } from '@/components/playback-progress';
import { useMediaSession } from '@/hooks/use-media-session';

import {
  AudioSourceBuffer,
  connectStallRecovery,
} from '@/lib/audio-source';

function useImmediateState<T>(initial: T) {
  const [value, render] = useState(initial);
  const ref = useRef(initial);

  const set = useCallback((next: React.SetStateAction<T>) => {
    ref.current = typeof next === 'function'
      ? (next as (old: T) => T)(ref.current)
      : next;

    render(ref.current);
  }, []);

  return [value, set, ref] as const;
}


type View = 'home' | 'library' | 'favorites' | string;
function IconButton({ label, children, active, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} {...(active !== undefined ? { 'aria-pressed': active } : {})} className={`icon-button ${active ? 'active' : ''} ${className}`} {...props}>{children}</button>;
}
function Artwork({ track, large = false, className = '' }: { track?: Track; large?: boolean; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { if (!track?.cover) { setUrl(undefined); return; } const src = URL.createObjectURL(track.cover); setUrl(src); return () => URL.revokeObjectURL(src); }, [track?.cover]);
  return <div className={`artwork palette-${coverColor(track?.album || track?.artist || 'onda')} ${large ? 'large-art' : ''} ${className}`} aria-hidden="true">
    {url ? <img src={url} alt="" /> : <><AudioLines strokeWidth={1.25} /><span className="art-initial">{track?.title.slice(0, 1).toUpperCase() || 'o'}</span>{large && <span className="art-label">{track?.genre || 'LA TUA MUSICA'}</span>}</>}
  </div>;
}
function Brand() { return <div className="brand"><AudioLines size={33} strokeWidth={2.8} /><span>onda<span className="brand-period">.</span></span></div>; }
function Navigation({ view, go, playlists, counts, onCreate, bytes, onInfo }: { view: View; go: (v: View) => void; playlists: Playlist[]; counts: number[]; onCreate: () => void; bytes: number; onInfo: () => void }) {
  const { setOpenMobile } = useSidebar();
  function nav(v: View) { go(v); setOpenMobile(false); }
  return <Sidebar className="app-sidebar"><SidebarHeader className="brand-area"><Brand /><span className="local-label">LOCAL MUSIC PLAYER</span></SidebarHeader><SidebarContent>
    <SidebarMenu className="primary-nav">
      {([{ id: 'home', label: 'Per te', icon: Sparkles }, { id: 'library', label: 'La tua libreria', icon: Library, count: counts[0] }, { id: 'favorites', label: 'Preferiti', icon: Heart, count: counts[1] }, { id: 'algorithm', label: 'Il tuo algoritmo', icon: SlidersHorizontal }] as const).map(item => <SidebarMenuItem key={item.id}><SidebarMenuButton isActive={view === item.id} onClick={() => nav(item.id)} className="nav-item"><item.icon /><span>{item.label}</span>{'count' in item && <small>{item.count}</small>}</SidebarMenuButton></SidebarMenuItem>)}
    </SidebarMenu>
    <div className="playlist-heading"><span>LE TUE PLAYLIST</span><IconButton label="Crea playlist" onClick={onCreate}><Plus size={18} /></IconButton></div>
    <SidebarMenu className="playlist-nav">{playlists.map(p => <SidebarMenuItem key={p.id}><SidebarMenuButton className="nav-item" isActive={view === p.id} onClick={() => nav(p.id)}><ListMusic /><span>{p.name}</span><small>{p.trackIds.length}</small></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
    {!playlists.length && <button className="create-playlist-hint" onClick={onCreate}><span className="dashed-icon"><Plus size={18} /></span>Un posto per ogni mood</button>}
  </SidebarContent><SidebarFooter className="sidebar-footer"><button onClick={onInfo} className="device-info"><HardDrive size={20} /><span>Solo su questo dispositivo<small>{counts[0]} brani · {formatSize(bytes)}</small></span></button><div className="sidebar-bottom"><span>La musica resta tua.</span><Headphones size={16} /></div></SidebarFooter></Sidebar>;
}

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([]), [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>('home'), [search, setSearch] = useState('');
  const [settings, setSettings] = useState<ListeningSettings>(DEFAULT_SETTINGS);
  const [selectionSeed, setSelectionSeed] = useState(1);
  const [tableLimit, setTableLimit] = useState(60);
  useEffect(() => setTableLimit(60), [view, search]);
  const [importing, setImporting] = useState(false), [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [dragging, setDragging] = useState(false), dragDepth = useRef(0), importingRef = useRef(false);
  const [infoOpen, setInfoOpen] = useState(false), [createOpen, setCreateOpen] = useState(false), [playlistName, setPlaylistName] = useState('');
  const [edit, setEdit] = useState<Track | null>(null), [addTo, setAddTo] = useState<Track | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'track' | 'playlist'; id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false), [queueOpen, setQueueOpen] = useState(false);
  const [songMenuLimit, setSongMenuLimit] = useState(60);
  const songMenuOpener = useRef<HTMLButtonElement | null>(null);
  function openSongs(event: React.MouseEvent<HTMLButtonElement>) {
    songMenuOpener.current = event.currentTarget;
    setSongMenuLimit(60);
    setQueueOpen(true);
  }
const [currentId, setCurrentId, currentIdRef] =
  useImmediateState<string | null>(null);

const [playing, setPlaying] = useState(false);

const [playerLoading, setPlayerLoading, loadingRef] =
  useImmediateState(false);

const [queue, setQueue, queueRef] =
  useImmediateState<string[]>([]);

const [shuffle, setShuffle, shuffleRef] =
  useImmediateState(false);

const [repeat, setRepeat, repeatRef] =
  useImmediateState<0 | 1 | 2>(0);
  const originalQueue = useRef<string[]>([]);
  const [duration, setDuration] = useState(0), [volume, setVolume] = useState(0.7);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'addedAt', desc: true }]);
  const fileInput = useRef<HTMLInputElement>(null), folderInput = useRef<HTMLInputElement>(null), audio = useRef<HTMLAudioElement>(null);
  const urlRef = useRef<string | null>(null), playSequence = useRef(0), listening = useRef(0), counted = useRef(false), didStart = useRef(false), lastTick = useRef(0);
  const sources = useRef(new AudioSourceBuffer(readAudio));
const requestedId = useRef<string | null>(null);

useEffect(() => {
  if (!audio.current) return;

  return connectStallRecovery(
    audio.current,
    () => loadingRef.current,
    () => toast.error(
      'Riproduzione interrotta. Premi Riproduci per riprovare.'
    )
  );
}, [loadingRef]);
  const current = tracks.find(t => t.id === currentId);
  const queuedTracks = useMemo(() => {
    const byId = new Map(tracks.map(track => [track.id, track]));
    return queue.map(id => byId.get(id)).filter((track): track is Track => !!track);
  }, [tracks, queue]);
  const songMenuTracks = queuedTracks.length ? queuedTracks : tracks;
  const playlist = playlists.find(p => p.id === view);
  const selection = useMemo(() => { try { return { rows: selectTracks(tracks, settings, selectionSeed), error: '' }; } catch (error) { return { rows: [] as Selection[], error: error instanceof Error ? error.message : 'Controlla il tuo algoritmo.' }; } }, [tracks, settings, selectionSeed]);
  const recommendations = useMemo(() => selection.rows.filter(r => r.track.id !== currentId).slice(0, 8), [selection.rows, currentId]);
  const totalBytes = tracks.reduce((s, t) => s + t.size, 0), totalPlays = tracks.reduce((s, t) => s + t.plays, 0);

  const refresh = useCallback(async () => {
    try { const data = await loadLibrary(); setTracks(data.tracks); setPlaylists(data.playlists.sort((a, b) => a.createdAt - b.createdAt)); setLoadError(''); }
    catch { setLoadError('La memoria locale non è disponibile. Consenti il salvataggio dei dati del sito e riprova.'); }
    finally { setReady(true); }
  }, []);
  useEffect(() => { void refresh(); try { const v = Number(localStorage.getItem('onda-volume')); if (localStorage.getItem('onda-volume') !== null && Number.isFinite(v)) setVolume(Math.max(0, Math.min(1, v))); } catch {} return () => {
  ++playSequence.current;
  sources.current.clear();

  if (urlRef.current) {
    URL.revokeObjectURL(urlRef.current);
  }
}; }, [refresh]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; try { localStorage.setItem('onda-volume', String(volume)); } catch {} }, [volume]);
  useEffect(() => { const sync = () => { if (!document.hidden && !importingRef.current) void refresh(); }; document.addEventListener('visibilitychange', sync); return () => document.removeEventListener('visibilitychange', sync); }, [refresh]);
  useEffect(() => { setSelectionSeed(randomSeed()); void loadSetting<ListeningSettings>('listening').then(saved => { if (saved && ['random', 'custom'].includes(saved.mode)) { validateAlgorithm(saved.algorithm); setSettings(saved); } }).catch(() => toast.error('Impostazioni non leggibili. Uso le regole iniziali; puoi salvarle di nuovo.')); }, []);
  async function saveSettings(value: ListeningSettings) {
    try { validateAlgorithm(value.algorithm); selectTracks(tracks, value, selectionSeed); await saveSetting('listening', value); setSettings(value); setSelectionSeed(randomSeed()); return true; }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Impostazioni non salvate.'); return false; }
  }
  const patch = useCallback(async (id: string, change: (t: Track) => Track) => {
    try { const updated = await editTrack(id, change); setTracks(old => old.map(t => t.id === id ? updated : t)); return updated; }
    catch { toast.error('Modifica non salvata. Controlla lo spazio disponibile e riprova.'); return null; }
  }, []);
  function go(v: View) { setView(v); setSearch(''); }
 async function importFiles(files: File[], demo = false) {
  if (importingRef.current || loadError) return;

  const valid = files.filter(isAudio);

  if (!valid.length) {
    toast.error(
      'Scegli dei file audio, per esempio MP3, FLAC, M4A o WAV.'
    );
    return;
  }

  importingRef.current = true;
  setImporting(true);
  setImportProgress({ done: 0, total: valid.length });

  let added = 0;
  let duplicates = 0;
  let failed = 0;
  let skipped = 0;
  let firstError = '';

  try {
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];

      try {
        const track = await importTrack(
          file,
          demo
            ? {
                ...demoTags[i],
                album: 'Piccole frequenze · Demo',
              }
            : {}
        );

        if (track) {
          setTracks(old => [
            ...old.filter(t => t.id !== track.id),
            track,
          ]);

          added++;
        } else {
          duplicates++;
        }
      } catch (error) {
        failed++;

        console.error(
          '[Onda][importazione]',
          file.name,
          error
        );

        const name = error instanceof Error ? error.name : '';
        const detail = error instanceof Error
          ? error.message
          : String(error);

        if (name === 'QuotaExceededError') {
          firstError = `${file.name}: spazio locale esaurito.`;
          skipped = valid.length - i - 1;
          break;
        }

        if (!firstError) {
          firstError =
            `${file.name}: ${name ? `${name}: ` : ''}${detail}`;
        }
      } finally {
        setImportProgress({
          done: i + 1,
          total: valid.length,
        });
      }
    }

    if (added) {
      toast.success(
        `${added} brani aggiunti` +
        `${duplicates ? ` · ${duplicates} già presenti` : ''}.`
      );
    } else if (duplicates && !failed) {
      toast.info('Questi brani sono già nella tua libreria.');
    }

    if (failed) {
      toast.error(
        `${failed} file non importati` +
        `${skipped ? ` · ${skipped} non elaborati` : ''}.`,
        {
          description: firstError,
          duration: 15000,
        }
      );
    }

    if (files.length > valid.length) {
      toast.info(
        `${files.length - valid.length} file non audio ignorati.`
      );
    }
  } finally {
    setImporting(false);
    importingRef.current = false;
  }
}
  async function demo() { if (importingRef.current) return; toast.info('Creo quattro brevi loop sul tuo dispositivo…'); const files = demoTags.map((_, i) => makeDemo(i)); await importFiles(files, true); }
  function markSkipped() {
  const id = currentIdRef.current;

  if (
    id &&
    didStart.current &&
    !counted.current &&
    listening.current > 0.5
  ) {
    didStart.current = false;

    void patch(id, t => ({
      ...t,
      skips: t.skips + 1,
    }));
  }
}
  function resetListening() { listening.current = 0; counted.current = false; didStart.current = false; lastTick.current = 0; }
function prepareNext(
  id = currentIdRef.current,
  ids = queueRef.current
) {
  const index = id ? ids.indexOf(id) : -1;

  const nextId = index < 0
    ? null
    : ids[index + 1] ||
      (repeatRef.current === 1 && !shuffleRef.current
        ? ids[0]
        : null);

  sources.current.prepare(
    nextId && nextId !== id ? nextId : null
  );
}

useEffect(() => {
  prepareNext();
}, [currentId, queue, repeat, shuffle]);

function pausePlayback() {
  ++playSequence.current;
  requestedId.current = null;
  setPlayerLoading(false);
  audio.current?.pause();
}

async function startTrack(
  track: Track,
  list?: string[],
  manual = true
) {
  const element = audio.current;
  if (!element) return;

  if (track.id === currentIdRef.current && !list) {
    togglePlay();
    return;
  }

  const token = ++playSequence.current;
  requestedId.current = track.id;
  setPlayerLoading(true);

  if (list) setQueue(list);

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const prepared = sources.current.take(track.id);

    // Se già preparato, non aspetta una lettura di IndexedDB.
    const url = prepared || await sources.current.load(track.id);

    if (token !== playSequence.current) {
      URL.revokeObjectURL(url);
      return;
    }

    if (manual && track.id !== currentIdRef.current) {
      markSkipped();
    }

    const oldUrl = urlRef.current;
    urlRef.current = url;

    resetListening();
    setCurrentId(track.id);
    setDuration(track.duration);

    // L'audio precedente continua fino a quando il nuovo file è pronto.
    element.src = url;

    if (oldUrl) URL.revokeObjectURL(oldUrl);

    const started = element.play();
    prepareNext(track.id, list || queueRef.current);

    await Promise.race([
      started,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          if (token === playSequence.current) {
            toast.error(
              'Il brano non parte. Premi Riproduci per riprovare.'
            );
            pausePlayback();
          }

          reject(new Error(
            'Il brano non parte. Premi Riproduci per riprovare.'
          ));
        }, 15000);
      }),
    ]);
  } catch (err) {
    if (
      token !== playSequence.current ||
      (err instanceof DOMException && err.name === 'AbortError')
    ) {
      return;
    }

    toast.error(
      err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Apri Onda e premi Riproduci per continuare.'
        : err instanceof Error
          ? err.message
          : 'File audio non riproducibile.'
    );

    setPlaying(!element.paused);
  } finally {
    clearTimeout(timer);

    if (token === playSequence.current) {
      requestedId.current = null;
      setPlayerLoading(false);
    }
  }
}
  function beginQueue(track: Track | undefined, ids: string[], random = shuffle) {
    const order = playbackOrder(ids, random, track?.id);
    const first = track || tracks.find(t => t.id === order[0]);
    if (!first) return;
    originalQueue.current = [...new Set(ids)];
    setShuffle(random);
    void startTrack(first, order);
  }
  function toggleShuffle() {
    const enabled = !shuffle;
    setShuffle(enabled);
    const available = new Set(tracks.map(t => t.id));
    const source = (originalQueue.current.length ? originalQueue.current : queue).filter(id => available.has(id));
    if (source.length) setQueue(playbackOrder(source, enabled, currentId));
  }

function resumePlayback() {
  const element = audio.current;

  if (
    !element ||
    !currentIdRef.current ||
    loadingRef.current
  ) {
    return;
  }

  if (element.ended) {
    element.currentTime = 0;
    resetListening();
  }

  void element.play().catch(error => {
    toast.error(
      error instanceof DOMException &&
      error.name === 'NotAllowedError'
        ? 'Apri Onda e premi Riproduci per continuare.'
        : 'Riproduzione non riuscita. Riprova con Riproduci.'
    );
  });
}

function togglePlay() {
  if (!audio.current) return;

  if (loadingRef.current) {
    pausePlayback();
    return;
  }

  if (!currentId) {
    const available = new Set(tracks.map(t => t.id));
    const queued = queue.filter(id => available.has(id));

    const ids = queued.length
      ? queued
      : selection.rows.length
        ? selection.rows.map(row => row.track.id)
        : tracks.map(t => t.id);

    beginQueue(
      undefined,
      ids,
      shuffle || (!queued.length && settings.mode === 'random')
    );

    return;
  }

  if (audio.current.paused) {
    resumePlayback();
  } else {
    pausePlayback();
  }
}

function next(manual = true) {
  if (!manual && loadingRef.current) return;

  const available = new Set(tracks.map(t => t.id));
  const ids = queueRef.current.filter(id => available.has(id));

  if (!ids.length) {
    pausePlayback();
    return;
  }

  if (!manual && repeatRef.current === 2 && audio.current) {
    audio.current.currentTime = 0;
    resetListening();
    resumePlayback();
    return;
  }

  const nextTrack = nextQueuedTrack(
    ids,
    requestedId.current || currentIdRef.current,
    repeatRef.current === 1,
    shuffleRef.current
  );

  if (nextTrack.id) {
    const track = tracks.find(t => t.id === nextTrack.id);

    if (track) {
      void startTrack(track, nextTrack.order, manual);
    }
  } else {
    if (manual) markSkipped();
    pausePlayback();

    if (manual) {
      toast.info(
        'Sei alla fine della coda. Scegli un altro brano o attiva la ripetizione.'
      );
    }
  }
}

function previous() {
  const element = audio.current;
  if (!element) return;

  if (!loadingRef.current && element.currentTime > 3) {
    element.currentTime = 0;
    return;
  }

  const ids = queueRef.current;
  const index = ids.indexOf(
    requestedId.current || currentIdRef.current || ''
  );

  const track = tracks.find(
    t => t.id === ids[Math.max(0, index - 1)]
  );

  if (track) void startTrack(track, ids);
}

 function timeUpdate() {
    const a = audio.current;

if (!a || !currentIdRef.current || loadingRef.current) return;
    
    const now = performance.now();
    if (!a.paused && !a.seeking && lastTick.current && now - lastTick.current < 2500) listening.current += (now - lastTick.current) / 1000;
    lastTick.current = now;
    const threshold = Math.min(30, (a.duration || duration) * 0.5);
    if (threshold > 0 && listening.current >= threshold && !counted.current) {
      counted.current = true;
      void patch(currentIdRef.current, t => ({
  ...t,
  plays: t.plays + 1,
  lastPlayed: Date.now(),
}));
    }
  }
  function seek(value: number[]) { if (!audio.current || !Number.isFinite(audio.current.duration)) return; audio.current.currentTime = value[0]; lastTick.current = performance.now();  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { const target = e.target as HTMLElement; if (e.code !== 'Space' || e.repeat || target.closest('button, input, textarea, select, [role="dialog"], [role="slider"], [contenteditable="true"]')) return; e.preventDefault(); togglePlay(); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  });
  useMediaSession(audio, current, {
  play: resumePlayback,
  pause: pausePlayback,
  next: () => next(),
  previous,
  seek: seconds => seek([seconds]),
});
function showMediaDiagnostics() {
  const a = audio.current;
  const session =
    'mediaSession' in navigator ? navigator.mediaSession : null;

  window.alert([
    'Verifica comandi Onda',
    `Contesto sicuro: ${window.isSecureContext ? 'sì' : 'no'}`,
    `Media Session: ${session ? 'presente' : 'assente'}`,
    `Collegamento: ${mediaSessionDebug.connected ? 'attivo' : 'assente'}`,
    `Stato sistema: ${session?.playbackState ?? 'non disponibile'}`,
    `Audio: ${!a ? 'assente' : a.paused ? 'in pausa' : 'in riproduzione'}`,
    `Brani in coda: ${queueRef.current.length}`,
    ...Object.entries(mediaSessionDebug.actions).map(
      ([action, result]) => `${action}: ${result}`
    ),
    `Ultimo comando: ${mediaSessionDebug.lastAction}`,
    `Errore comando: ${mediaSessionDebug.lastError || 'nessuno'}`,
    navigator.userAgent,
  ].join('\n'));
}
  async function createPlaylist(event: React.FormEvent) {
    event.preventDefault(); const name = playlistName.trim(); if (!name || saving) return; setSaving(true);
    try { const p: Playlist = { id: crypto.randomUUID(), name, trackIds: addTo ? [addTo.id] : [], createdAt: Date.now() }; await savePlaylist(p); setPlaylists(old => [...old, p]); setPlaylistName(''); setCreateOpen(false); setAddTo(null); go(p.id); toast.success('Playlist creata.'); }
    catch { toast.error('Non riesco a salvare la playlist. Riprova.'); } finally { setSaving(false); }
  }
  async function addTrackToPlaylist(p: Playlist) {
    if (!addTo || saving) return; if (p.trackIds.includes(addTo.id)) { toast.info('Il brano è già in questa playlist.'); return; } setSaving(true);
    const updated = { ...p, trackIds: [...p.trackIds, addTo.id] };
    try { await savePlaylist(updated); setPlaylists(old => old.map(v => v.id === p.id ? updated : v)); setAddTo(null); toast.success(`Aggiunto a ${p.name}.`); }
    catch { toast.error('Brano non aggiunto. Riprova.'); } finally { setSaving(false); }
  }
  async function removeFromPlaylist(t: Track) {
    if (!playlist) return; const updated = { ...playlist, trackIds: playlist.trackIds.filter(id => id !== t.id) };
    try { await savePlaylist(updated); setPlaylists(old => old.map(p => p.id === updated.id ? updated : p)); toast.success('Brano rimosso dalla playlist.'); } catch { toast.error('Modifica non salvata.'); }
  }
  async function deletion() {
    if (!confirm || saving) return; setSaving(true);
    try {
      if (confirm.kind === 'track') { await removeTrack(confirm.id); if (currentId === confirm.id) { ++playSequence.current; audio.current?.pause(); audio.current?.removeAttribute('src'); if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; setCurrentId(null); setDuration(0); setPlayerLoading(false); } originalQueue.current = originalQueue.current.filter(id => id !== confirm.id); setQueue(q => q.filter(id => id !== confirm.id)); }
      else { await removePlaylist(confirm.id); if (view === confirm.id) go('library'); }
      await refresh(); setConfirm(null); toast.success(confirm.kind === 'track' ? 'Brano rimosso. Il file originale non è stato modificato.' : 'Playlist eliminata. I brani restano nella libreria.');
    } catch { toast.error('Rimozione non riuscita. Riprova.'); } finally { setSaving(false); }
  }
  const visibleTracks = useMemo(() => view === 'favorites' ? tracks.filter(t => t.liked) : playlist ? playlist.trackIds.map(id => tracks.find(t => t.id === id)).filter((t): t is Track => !!t) : view === 'home' ? [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 5) : tracks, [tracks, view, playlist]);
  const columns = useMemo<ColumnDef<Track>[]>(() => [{ accessorKey: 'title' }, { accessorKey: 'artist' }, { accessorKey: 'album' }, { accessorKey: 'genre' }, { accessorKey: 'addedAt' }, { accessorKey: 'duration' }], []);
  const table = useReactTable({ data: visibleTracks, columns, state: { globalFilter: search, sorting: playlist ? [] : sorting }, onSortingChange: setSorting, onGlobalFilterChange: setSearch, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(), globalFilterFn: (row, _column, value: string) => `${row.original.title} ${row.original.artist} ${row.original.album} ${row.original.genre}`.toLocaleLowerCase('it').includes(value.toLocaleLowerCase('it')) });
  const displayed = table.getRowModel().rows.map(r => r.original);
  const title = view === 'algorithm' ? 'Il tuo algoritmo.' : view === 'home' ? 'La tua musica, oggi.' : view === 'library' ? 'La tua libreria' : view === 'favorites' ? 'I tuoi preferiti' : playlist?.name || 'La tua libreria';
  const pickFiles = () => fileInput.current?.click(), pickFolder = () => folderInput.current?.click();
  function playSelection(list: Selection[], random = false) { beginQueue(undefined, list.map(r => r.track.id), random); }
  function playRecommendation(track: Track) { beginQueue(track, selection.rows.map(row => row.track.id), shuffle || settings.mode === 'random'); }
  function playMix() { try { const seed = randomSeed(); setSelectionSeed(seed); playSelection(selectTracks(tracks, settings, seed), settings.mode === 'random'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Controlla il tuo algoritmo.'); go('algorithm'); } }
  function actions(t: Track) { return <DropdownMenu><DropdownMenuTrigger asChild><IconButton label={`Opzioni per ${t.title}`}><MoreHorizontal size={19} /></IconButton></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>{t.title}</DropdownMenuLabel><DropdownMenuItem onClick={() => setAddTo(t)}><ListMusic />Aggiungi a una playlist</DropdownMenuItem><DropdownMenuItem onClick={() => { if (queue.includes(t.id)) { toast.info('Il brano è già nella coda.'); } else { originalQueue.current = [...new Set([...originalQueue.current, ...queue, t.id])]; setQueue(q => [...q, t.id]); toast.success('Brano aggiunto alla coda.'); } }}><Plus />Aggiungi alla coda</DropdownMenuItem><DropdownMenuItem onClick={() => setEdit({ ...t })}><SlidersHorizontal />Modifica informazioni</DropdownMenuItem>{playlist && <DropdownMenuItem onClick={() => void removeFromPlaylist(t)}><X />Rimuovi dalla playlist</DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem className="delete-item" onClick={() => setConfirm({ kind: 'track', id: t.id, name: t.title })}><Trash2 />Rimuovi dalla libreria</DropdownMenuItem></DropdownMenuContent></DropdownMenu>; }
  function trackTable() { return <Table className="track-table"><TableHeader><TableRow><TableHead className="number-cell">#</TableHead><TableHead>BRANO</TableHead><TableHead className="album-cell">ALBUM</TableHead><TableHead className="genre-cell">GENERE</TableHead><TableHead className="duration-cell"><Clock3 size={15} aria-label="Durata" /></TableHead><TableHead className="actions-cell"><span className="sr-only">Azioni</span></TableHead></TableRow></TableHeader><TableBody>{displayed.slice(0, tableLimit).map((t, i) => <TableRow key={t.id} className={currentId === t.id ? 'is-current' : ''} onDoubleClick={() => beginQueue(t, displayed.map(t => t.id))}><TableCell className="number-cell"><button className="row-play" onClick={() => currentId === t.id ? togglePlay() : beginQueue(t, displayed.map(t => t.id))} aria-label={`${currentId === t.id && playing ? 'Pausa' : 'Riproduci'} ${t.title}`}><span className="row-number">{currentId === t.id && playing ? <AudioLines size={17} className="playing-wave" /> : String(i + 1).padStart(2, '0')}</span><span className="row-play-icon">{currentId === t.id && playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</span></button></TableCell><TableCell><div className="track-identity"><Artwork track={t} /><button onClick={() => currentId === t.id ? togglePlay() : beginQueue(t, displayed.map(t => t.id))}><strong>{t.title}</strong><span>{t.artist}</span></button><span className="format-badge">{t.format}</span></div></TableCell><TableCell className="album-cell">{t.album || '—'}</TableCell><TableCell className="genre-cell">{t.genre || '—'}</TableCell><TableCell className="duration-cell">{t.duration ? formatTime(t.duration) : '—'}</TableCell><TableCell className="actions-cell"><div className="track-actions"><IconButton label={t.liked ? `Rimuovi ${t.title} dai preferiti` : `Mi piace ${t.title}`} active={t.liked} onClick={() => void patch(t.id, old => ({ ...old, liked: !old.liked }))}><Heart size={18} fill={t.liked ? 'currentColor' : 'none'} /></IconButton>{actions(t)}</div></TableCell></TableRow>)}</TableBody></Table>; }

  function playbackControls() { return <div className="playback-controls"><IconButton label="Riproduzione casuale" active={shuffle} disabled={!tracks.length} onClick={toggleShuffle}><Shuffle size={17} /></IconButton><IconButton label="Brano precedente" disabled={!current} onClick={previous}><SkipBack size={21} fill="currentColor" /></IconButton><IconButton className="main-play" label={
  playerLoading
    ? 'Annulla caricamento'
    : playing
      ? 'Pausa'
      : 'Riproduci'
}
disabled={!tracks.length} onClick={togglePlay}>{playerLoading ? <Loader2 size={22} className="spin" /> : playing ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}</IconButton><IconButton label="Brano successivo" disabled={!current} onClick={() => next()}><SkipForward size={21} fill="currentColor" /></IconButton><IconButton label={repeat === 0 ? 'Attiva ripetizione della coda' : repeat === 1 ? 'Ripeti solo questo brano' : 'Disattiva ripetizione'} active={repeat > 0} disabled={!tracks.length} onClick={() => setRepeat(((repeat + 1) % 3) as 0 | 1 | 2)}>{repeat === 2 ? <Repeat1 size={17} /> : <Repeat size={17} />}</IconButton></div>; }

  return <SidebarProvider style={{ '--sidebar-width': '232px' } as CSSProperties}><Navigation view={view} go={go} playlists={playlists} counts={[tracks.length, tracks.filter(t => t.liked).length]} onCreate={() => setCreateOpen(true)} bytes={totalBytes} onInfo={() => setInfoOpen(true)} />
    <main className="app-main" onDragEnter={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); dragDepth.current++; setDragging(true); } }} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDragLeave={e => { e.preventDefault(); if (--dragDepth.current <= 0) setDragging(false); }} onDrop={e => { e.preventDefault(); dragDepth.current = 0; setDragging(false); void importFiles(Array.from(e.dataTransfer.files)); }}>
      <header className="topbar"><div className="topbar-left"><SidebarTrigger className="mobile-menu" aria-label="Apri navigazione" /><span className="mobile-brand">onda.</span><span className="breadcrumb">Il tuo spazio musicale<ChevronRight size={15} /><strong>{view === 'algorithm' ? 'Algoritmo' : view === 'home' ? 'Per te' : view === 'favorites' ? 'Preferiti' : playlist ? 'Playlist' : 'Libreria'}</strong></span></div><div className="topbar-right"><DeviceSetup /><button className="button primary import-top" aria-label="Importa musica" onClick={pickFiles} disabled={importing || !ready || !!loadError}><Plus size={18} /><span>Importa musica</span></button></div></header>
      <div style={{ padding: '12px 20px' }}>
  <button
    type="button"
    className="button outline"
    onClick={showMediaDiagnostics}
  >
    Verifica comandi esterni
  </button>
</div>
      <input type="file" ref={fileInput} className="sr-only" tabIndex={-1} multiple accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus,.aif,.aiff" onChange={e => { void importFiles(Array.from(e.target.files || [])); e.target.value = ''; }} aria-label="Seleziona file musicali" />
      <input type="file" ref={el => { folderInput.current = el; el?.setAttribute('webkitdirectory', ''); }} className="sr-only" tabIndex={-1} multiple onChange={e => { void importFiles(Array.from(e.target.files || [])); e.target.value = ''; }} aria-label="Seleziona cartella musicale" />
      <div className="page-content"><div className="page-heading"><div><p className="eyebrow">{view === 'algorithm' ? 'SEGUI LE TUE REGOLE' : view === 'home' ? 'BUON ASCOLTO' : playlist ? 'PLAYLIST PERSONALE' : 'LA TUA COLLEZIONE'}</p><h1>{title}</h1><p className="page-subtitle">{view === 'algorithm' ? 'Decidi cosa ascoltare dopo. Cambia i pesi e guarda il risultato.' : view === 'home' ? 'La tua libreria. Il tuo ritmo. Le tue regole.' : `${visibleTracks.length} ${visibleTracks.length === 1 ? 'brano' : 'brani'}${playlist ? ' · Una selezione tutta tua' : ' · Salvati su questo dispositivo'}`}</p></div>{playlist ? <div className="heading-actions"><button className="button primary" disabled={!displayed.length} onClick={() => beginQueue(undefined, displayed.map(t => t.id))}><Play size={16} fill="currentColor" />Ascolta</button><IconButton label="Elimina playlist" onClick={() => setConfirm({ kind: 'playlist', id: playlist.id, name: playlist.name })}><Trash2 size={18} /></IconButton></div> : view === 'home' && tracks.length > 0 ? <button className="button subtle" onClick={playMix}><Shuffle size={17} />Scegli per me</button> : null}</div>
      {importing && <div className="import-progress" role="status"><Loader2 className="spin" size={18} /><span>Importazione in corso <strong>{importProgress.done}/{importProgress.total}</strong></span><Progress value={importProgress.total ? importProgress.done / importProgress.total * 100 : 0} /></div>}
      {!ready ? <div className="loading-library" aria-label="Caricamento libreria"><Skeleton className="h-64 w-full" /><Skeleton className="h-16 w-full" /></div> : loadError ? <Empty className="error-state"><EmptyHeader><HardDrive size={36} /><EmptyTitle>Serve l’accesso alla memoria locale</EmptyTitle><EmptyDescription>{loadError}</EmptyDescription></EmptyHeader><button className="button primary" onClick={() => void refresh()}>Riprova</button></Empty> : view === 'algorithm' ? <AlgorithmEditor tracks={tracks} settings={settings} onSave={saveSettings} onPlay={playSelection} onImport={pickFiles} /> : tracks.length === 0 ? <>
        <section className="welcome-grid"><Empty className="import-zone"><div className="import-icon"><FolderOpen size={34} strokeWidth={1.5} /><span><Plus size={13} /></span></div><EmptyHeader><p className="eyebrow">FACCIAMO SPAZIO ALLA TUA MUSICA</p><EmptyTitle className="import-title">La tua collezione<br />parte da qui.</EmptyTitle><EmptyDescription>Trascina i tuoi file audio oppure scegli una cartella dal dispositivo.</EmptyDescription></EmptyHeader><div className="import-buttons"><button className="button primary" onClick={pickFolder} disabled={importing}><FolderOpen size={17} />Scegli una cartella</button><button className="button outline" onClick={pickFiles} disabled={importing}><Plus size={17} />Aggiungi file</button></div><span className="supported-formats">MP3 <i /> FLAC <i /> WAV <i /> M4A <i /> OGG</span></Empty>
        <aside className="listening-note"><div className="note-top"><Sparkles size={24} /><span>IN SINTONIA CON TE</span></div><h2>Il prossimo brano?<br />Lascia fare a Onda.</h2><p>Una selezione che prende forma con i tuoi ascolti.</p><div className="learning-steps"><div><span>01</span><p>Porta la tua musica<small>Partiamo dalla tua libreria.</small></p></div><div><span>02</span><p>Segui quello che ti piace<small>Ascolti e cuori fanno la differenza.</small></p></div><div><span>03</span><p>Ritrova il brano giusto<small>Anche quello che avevi dimenticato.</small></p></div></div><button className="text-button" onClick={() => go('algorithm')}>Crea il tuo algoritmo<ArrowRight size={16} /></button></aside></section>
        <div className="demo-strip"><span className="demo-icon"><Headphones size={25} /></span><div><h3>Prima, facciamo un soundcheck?</h3><p>Quattro brevi loop originali, generati qui sul dispositivo.</p></div><button className="button outline" disabled={importing} onClick={() => void demo()}><Play size={15} />Prova la demo</button></div>
        <section className="empty-library-section"><div className="section-heading"><h2>La tua libreria</h2><span>0 brani</span></div><div className="empty-table-header"><span>#</span><span>BRANO</span><span>ALBUM</span><Clock3 size={15} /></div><p>I tuoi album, i tuoi artisti, il tuo piccolo universo musicale.</p></section>
      </> : <>
        {view === 'home' && <><section className="recommendation-section"><div className="section-heading"><div><h2>In sintonia con te <Sparkles size={18} /></h2><p>{totalPlays || tracks.some(t => t.liked) ? 'Scelte dalla tua libreria secondo la modalità selezionata.' : 'I primi suggerimenti. Ascolta e metti un cuore per renderli tuoi.'}</p></div><div className="mix-settings"><Select value={settings.mode} onValueChange={v => void saveSettings({ ...settings, mode: v as ListeningSettings['mode'] })}><SelectTrigger className="discovery-select" aria-label="Modalità di selezione"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="custom">Il mio algoritmo</SelectItem><SelectItem value="random">Casuale</SelectItem></SelectContent></Select><button className="button outline" onClick={() => go('algorithm')}><SlidersHorizontal size={16} />Personalizza</button></div></div><div className="recommendation-grid">{recommendations.slice(0, 4).map((r, i) => <article className="recommendation-card" key={r.track.id}><div className="recommendation-cover"><Artwork track={r.track} large /><span className="selection-number">{String(i + 1).padStart(2, '0')}</span><button className="cover-play" aria-label={`Ascolta ${r.track.title}`} onClick={() => playRecommendation(r.track)}><Play fill="currentColor" size={23} /></button></div><div className="recommendation-title"><button onClick={() => playRecommendation(r.track)}>{r.track.title}</button><IconButton label={r.track.liked ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'} active={r.track.liked} onClick={() => void patch(r.track.id, t => ({ ...t, liked: !t.liked }))}><Heart size={17} fill={r.track.liked ? 'currentColor' : 'none'} /></IconButton></div><p className="recommendation-artist">{r.track.artist}</p><p className="recommendation-reason"><Sparkles size={12} />{r.reason}</p></article>)}</div>{selection.error && <p className="formula-error" role="alert">{selection.error} <button className="text-button" onClick={() => go('algorithm')}>Correggi l’algoritmo</button></p>}{!recommendations.length && !selection.error && <div className="single-track-note">Stai ascoltando l’unico brano della libreria. Aggiungine altri per ricevere nuovi suggerimenti.<button className="text-button" onClick={pickFiles}>Aggiungi musica<Plus size={16} /></button></div>}</section>
          <div className="daily-mix"><div className="mix-mark"><AudioLines size={35} /></div><div><span className="eyebrow">IL TUO MIX PERSONALE</span><h3>La prossima scelta è nelle tue mani.</h3><p>{tracks.length} brani · {settings.mode === 'custom' ? settings.algorithm.name : 'Ordine casuale'}</p></div><button className="button primary" onClick={playMix}><Play size={16} fill="currentColor" />Ascolta il mix</button></div></>}
        <section className="library-section"><div className="section-heading"><div><h2>{view === 'home' ? 'Aggiunti di recente' : view === 'favorites' ? 'I brani che ami' : 'Tutti i brani'}</h2>{view !== 'home' && <p>{displayed.length} {displayed.length === 1 ? 'brano' : 'brani'}{search ? ` per “${search}”` : ''}</p>}</div>{view === 'home' ? <button className="text-button" onClick={() => go('library')}>Apri la libreria<ArrowRight size={16} /></button> : <button className="button outline small" onClick={pickFolder} disabled={importing}><FolderOpen size={16} /><span>Aggiungi cartella</span></button>}</div>
          {view !== 'home' && <div className="library-toolbar"><label className="search-field"><Search size={18} /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca brani, artisti, album…" aria-label="Cerca nella libreria" />{search && <IconButton label="Cancella ricerca" onClick={() => setSearch('')}><X size={16} /></IconButton>}</label>{!playlist && <Select value={sorting[0]?.id || 'addedAt'} onValueChange={id => setSorting([{ id, desc: id === 'addedAt' }])}><SelectTrigger className="sort-select" aria-label="Ordina libreria"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="addedAt">Aggiunti di recente</SelectItem><SelectItem value="title">Titolo A–Z</SelectItem><SelectItem value="artist">Artista A–Z</SelectItem><SelectItem value="album">Album A–Z</SelectItem></SelectContent></Select>}</div>}
          {displayed.length ? <>{trackTable()}{displayed.length > tableLimit && <button className="button outline load-more" onClick={() => setTableLimit(n => n + 60)}>Mostra altri brani ({tableLimit} di {displayed.length})</button>}</> : <Empty className="filtered-empty"><EmptyHeader>{view === 'favorites' ? <Heart size={34} /> : search ? <Search size={34} /> : <ListMusic size={34} />}<EmptyTitle>{search ? 'Nessun brano trovato' : view === 'favorites' ? 'Qui c’è posto per i tuoi preferiti.' : 'Diamo un suono a questa playlist.'}</EmptyTitle><EmptyDescription>{search ? 'Prova con un altro titolo, artista o album.' : view === 'favorites' ? 'Tocca il cuore accanto a un brano. Lo ritroverai qui.' : 'Apri il menu di un brano nella libreria e scegli “Aggiungi a una playlist”.'}</EmptyDescription></EmptyHeader><button className="button outline" onClick={() => search ? setSearch('') : go('library')}>{search ? 'Cancella ricerca' : 'Esplora la libreria'}</button></Empty>}
        </section><footer className="collection-footer"><span><HardDrive size={14} />{formatSize(totalBytes)} sul tuo dispositivo</span><span>{totalPlays} {totalPlays === 1 ? 'ascolto' : 'ascolti'} · Nessun file audio caricato online</span></footer>
      </>}
      </div>{dragging && <div className="drop-overlay"><FolderOpen size={58} /><h2>Lascia qui la tua musica.</h2><p>I file restano su questo dispositivo.</p></div>}
    </main>
    <div className="player" role="region" aria-label="Lettore musicale"><div className="now-playing"><Artwork track={current} /><div className="now-playing-text"><strong>{current?.title || 'La tua prossima traccia'}</strong><span>{current?.artist || 'Scegli un brano e mettiti comodo.'}</span></div>{current && <IconButton className="player-heart" label={current.liked ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'} active={current.liked} onClick={() => void patch(current.id, t => ({ ...t, liked: !t.liked }))}><Heart size={19} fill={current.liked ? 'currentColor' : 'none'} /></IconButton>}</div><button type="button" className="player-song-menu" aria-label="Apri menu canzoni" aria-haspopup="dialog" aria-expanded={queueOpen} aria-controls="song-menu" onClick={openSongs}><ListMusic size={20} /><span>Canzoni</span></button><div className="player-center">{playbackControls()}<PlaybackProgress audioRef={audio} currentId={currentId} duration={duration} onSeek={seek} /></div><div className="player-extras"><IconButton label="Apri menu canzoni" active={queueOpen} aria-haspopup="dialog" aria-expanded={queueOpen} aria-controls="song-menu" onClick={openSongs}><ListMusic size={20} /></IconButton><div className="player-divider" /><IconButton label={volume === 0 ? 'Attiva audio' : 'Disattiva audio'} onClick={() => setVolume(volume === 0 ? 0.7 : 0)}>{volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}</IconButton><Slider aria-label="Volume" min={0} max={1} step={0.01} value={[volume]} onValueChange={v => setVolume(v[0])} className="volume-slider" /></div></div>
    <audio ref={audio} preload="auto" onPlay={() => { setPlaying(true); didStart.current = true; lastTick.current = performance.now(); }} onPause={() => {
  setPlaying(false);
  lastTick.current = 0;

  if (
    audio.current?.paused &&
    !audio.current.ended &&
    loadingRef.current
  ) {
    pausePlayback();
  }
}} onTimeUpdate={timeUpdate} onSeeking={() => { lastTick.current = 0; }} onSeeked={() => { lastTick.current = performance.now(); }} onLoadedMetadata={() => { const d = audio.current?.duration; if (d && Number.isFinite(d)) { setDuration(d); if (currentId && Math.abs((current?.duration || 0) - d) > 1) void patch(currentId, t => ({ ...t, duration: d })); } }} onEnded={() => next(false)} onError={() => { if (audio.current?.getAttribute('src')) { setPlaying(false); setPlayerLoading(false); if (didStart.current) toast.error('Riproduzione interrotta: file audio non leggibile. Prova un altro brano.'); } }} />
    <Toaster theme="dark" position="top-right" richColors closeButton />
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="onda-dialog"><DialogHeader><DialogTitle>Una nuova playlist</DialogTitle><DialogDescription>Un nome per le canzoni che stanno bene insieme.</DialogDescription></DialogHeader><form onSubmit={createPlaylist} className="dialog-form"><label>Nome della playlist<Input autoFocus placeholder="Es. Sulla strada di casa" value={playlistName} maxLength={70} onChange={e => setPlaylistName(e.target.value)} required /></label><button className="button primary" disabled={!playlistName.trim() || saving}>{saving ? 'Salvataggio…' : 'Crea playlist'}</button></form></DialogContent></Dialog>
    <Dialog open={!!addTo && !createOpen} onOpenChange={open => { if (!open) setAddTo(null); }}><DialogContent className="onda-dialog"><DialogHeader><DialogTitle>Aggiungi a una playlist</DialogTitle><DialogDescription>{addTo?.title}</DialogDescription></DialogHeader><div className="playlist-options">{playlists.map(p => <button key={p.id} onClick={() => void addTrackToPlaylist(p)} disabled={saving || p.trackIds.includes(addTo?.id || '')}><ListMusic size={20} /><span>{p.name}<small>{p.trackIds.length} brani</small></span>{p.trackIds.includes(addTo?.id || '') ? <Check size={18} /> : <Plus size={18} />}</button>)}</div><button className="button outline" onClick={() => setCreateOpen(true)}><Plus size={18} />Crea una nuova playlist</button></DialogContent></Dialog>
    <Dialog open={!!edit} onOpenChange={open => { if (!open) setEdit(null); }}><DialogContent className="onda-dialog"><DialogHeader><DialogTitle>Informazioni del brano</DialogTitle><DialogDescription>Le modifiche riguardano solo la libreria di Onda. Il file originale resta intatto.</DialogDescription></DialogHeader>{edit && <form className="dialog-form" onSubmit={async e => { e.preventDefault(); if (!edit.title.trim() || saving) return; setSaving(true); const result = await patch(edit.id, t => ({ ...t, title: edit.title.trim(), artist: edit.artist.trim() || 'Artista sconosciuto', album: edit.album.trim(), genre: edit.genre.trim() })); setSaving(false); if (result) { setEdit(null); toast.success('Informazioni aggiornate.'); } }}>{(['title', 'artist', 'album', 'genre'] as const).map((key, i) => <label key={key}>{['Titolo', 'Artista', 'Album', 'Genere'][i]}<Input value={edit[key]} required={key === 'title'} maxLength={160} onChange={e => setEdit({ ...edit, [key]: e.target.value })} /></label>)}<span className="file-detail">{edit.filename} · {formatSize(edit.size)} · {edit.format}</span><button className="button primary" disabled={saving || !edit.title.trim()}>{saving ? 'Salvataggio…' : 'Salva modifiche'}</button></form>}</DialogContent></Dialog>
    <AlertDialog open={!!confirm} onOpenChange={open => { if (!open && !saving) setConfirm(null); }}><AlertDialogContent className="onda-dialog"><AlertDialogHeader><AlertDialogTitle>{confirm?.kind === 'track' ? 'Rimuovere questo brano?' : 'Eliminare questa playlist?'}</AlertDialogTitle><AlertDialogDescription>{confirm?.kind === 'track' ? `“${confirm.name}” verrà rimosso dalla libreria, dalle playlist e dalla cronologia locale. Il file originale sul dispositivo resta intatto.` : `La playlist “${confirm?.name}” verrà eliminata. I suoi brani resteranno nella libreria.`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Annulla</AlertDialogCancel><AlertDialogAction className="delete-confirm" disabled={saving} onClick={e => { e.preventDefault(); void deletion(); }}>{saving ? 'Rimozione…' : 'Rimuovi'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={infoOpen} onOpenChange={setInfoOpen}><DialogContent className="onda-dialog info-dialog"><DialogHeader><DialogTitle>La tua musica resta qui.</DialogTitle><DialogDescription>Onda usa solo i file che scegli di aggiungere.</DialogDescription></DialogHeader><div className="info-block"><HardDrive /><div><h3>Una libreria sul dispositivo</h3><p>Audio, copertine, playlist e gusti sono salvati nella memoria locale di questo browser. I file originali restano intatti. Cancellare i dati del sito cancella anche questa libreria; su un altro browser dovrai importarla di nuovo.</p></div></div><div className="info-block"><Sparkles /><div><h3>Suggerimenti, con un motivo</h3><p>Preferiti, ascolti di almeno 30 secondi (o metà brano, se più breve), brani saltati, artista e genere determinano la selezione. Le regole iniziali penalizzano gli ascolti recenti e favoriscono i brani ancora da ascoltare. Puoi cambiarle in ogni momento.</p><p>In “Il tuo algoritmo” scegli regole e pesi, oppure scrivi una formula. La modalità casuale assegna la stessa probabilità a tutti. Il suono non viene analizzato automaticamente.</p></div></div><div className="info-block"><FolderHeart /><div><h3>I tuoi formati, le tue cartelle</h3><p>Importa file o cartelle. Titoli, artisti e copertine vengono letti dai metadati disponibili; puoi correggere le informazioni dal menu del brano. La riproduzione dei formati dipende dal browser.</p></div></div></DialogContent></Dialog>
    <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
      <SheetContent id="song-menu" className="queue-sheet" showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); songMenuOpener.current?.focus(); }}>
        <SheetHeader>
          <SheetTitle>Canzoni</SheetTitle>
          <SheetDescription>{songMenuTracks.length} brani {queuedTracks.length ? 'nella coda di riproduzione' : 'nella tua libreria'}</SheetDescription>
        </SheetHeader>
        <SheetClose asChild><IconButton className="queue-close" label="Chiudi canzoni"><X size={22} /></IconButton></SheetClose>
        <div className="queue-player">{playbackControls()}</div>
        <div className="queue-settings">
          <IconButton label={volume === 0 ? 'Attiva audio' : 'Disattiva audio'} onClick={() => setVolume(volume === 0 ? 0.7 : 0)}>{volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}</IconButton>
          <Slider aria-label="Volume nella coda" min={0} max={1} step={0.01} value={[volume]} onValueChange={v => setVolume(v[0])} />
        </div>
        <button type="button" className="button outline queue-library" onClick={() => { setQueueOpen(false); go('library'); }}><Library size={18} />Apri tutta la libreria<ArrowRight size={16} /></button>
        <div className="queue-list">
          {songMenuTracks.length ? <>
            {songMenuTracks.slice(0, songMenuLimit).map((track, i) => <button type="button" key={`${track.id}-${i}`} className={currentId === track.id ? 'queue-track is-current' : 'queue-track'} aria-current={currentId === track.id ? 'true' : undefined} aria-label={`${currentId === track.id && playing ? 'Pausa' : 'Riproduci'} ${track.title}`} onClick={() => currentId === track.id ? togglePlay() : queuedTracks.length ? void startTrack(track, queue) : beginQueue(track, songMenuTracks.map(t => t.id))}>
              <Artwork track={track} /><span><strong>{track.title}</strong><small>{track.artist}</small></span>{currentId === track.id && playing ? <Pause size={18} /> : <Play size={16} />}
            </button>)}
            {songMenuTracks.length > songMenuLimit && <button type="button" className="button outline load-more" onClick={() => setSongMenuLimit(limit => limit + 60)}>Mostra altri brani ({songMenuLimit} di {songMenuTracks.length})</button>}
          </> : <Empty><ListMusic size={32} /><EmptyHeader><EmptyTitle>La tua libreria è vuota.</EmptyTitle><EmptyDescription>Importa la tua musica per scegliere cosa ascoltare.</EmptyDescription></EmptyHeader><button type="button" className="button primary" disabled={importing || !ready || !!loadError} onClick={() => { setQueueOpen(false); pickFiles(); }}><Plus size={18} />Importa musica</button></Empty>}
        </div>
      </SheetContent>
    </Sheet>
  </SidebarProvider>;
}
