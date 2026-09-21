import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Square, RotateCcw, Check } from 'lucide-react';
import { request } from './bridge';
import './downloads.css';

type Entry = { id: string; title: string; status: 'pending' | 'working' | 'added' | 'duplicate' | 'failed'; note?: string };
type State = {
  busy?: boolean; stage?: string; message?: string; percent?: number; current?: number; url?: string; playlist?: boolean;
  added?: number; duplicates?: number; failed?: number; remaining?: number; canResume?: boolean; lastFmConfigured?: boolean; entries?: Entry[];
};
const stages: Record<string, string> = {
  preparing: 'Preparazione del download', listing: 'Lettura della playlist', metadata: 'Ricerca dei metadati',
  downloading: 'Download audio', converting: 'Conversione in MP3', importing: 'Aggiunta alla libreria',
  cancelling: 'Annullamento in corso…', cancelled: 'Download annullato', interrupted: 'Download interrotto',
  done: 'Coda terminata', error: 'Download non riuscito',
};
const labels: Record<Entry['status'], string> = { pending: 'Da scaricare', working: 'In corso', added: 'In libreria', duplicate: 'Già in libreria', failed: 'Non riuscito' };

export function DownloadPanel() {
  const [state, setState] = useState<State>({});
  const [url, setUrl] = useState(''), [playlist, setPlaylist] = useState(false);
  const [key, setKey] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false), [loaded, setLoaded] = useState(false), [limit, setLimit] = useState(30);
  const sequence = useRef(0), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let stopped = false, timer: ReturnType<typeof setTimeout>, initialized = false;
    async function poll() {
      const id = ++sequence.current;
      try {
        const next = await request<State>('musicDownloadState');
        if (stopped || id !== sequence.current) return;
        setState(next); setLoaded(true);
        if (!initialized) { initialized = true; setUrl(next.url || ''); setPlaylist(!!next.playlist); }
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : 'Stato download non disponibile'); }
      finally { if (!stopped) timer = setTimeout(() => { if (document.visibilityState === 'visible') void poll(); }, 1500); }
    }
    const visibility = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); void poll(); } };
    document.addEventListener('visibilitychange', visibility); void poll();
    return () => { stopped = true; mounted.current = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  async function action(method: string, params = {}) {
    ++sequence.current;
    setPending(true); setError(''); setNotice('');
    try {
      const next = await request<State>(method, params);
      if (mounted.current) {
        ++sequence.current; setState(next);
        if (method === 'configureMusicDownloads') { setKey(''); setNotice(next.lastFmConfigured ? 'Chiave Last.fm salvata sul telefono.' : 'Chiave Last.fm rimossa.'); }
      }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Operazione non riuscita'); }
    finally { if (mounted.current) setPending(false); }
  }
  const disabled = pending || !!state.busy || !loaded;
  const entries = state.entries || [], current = entries[state.current ?? -1];
  const done = entries.filter(e => e.status === 'added' || e.status === 'duplicate' || e.status === 'failed').length;
  return <section className="downloads" aria-label="Scarica musica">
    <form className="download-card" onSubmit={e => { e.preventDefault(); setLimit(30); void action('startMusicDownloads', { url, playlist }); }}>
      <label htmlFor="youtube-link">Link YouTube</label>
      <input id="youtube-link" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://www.youtube.com/watch?v=…" value={url} required maxLength={2048} disabled={disabled}
        onChange={e => { setUrl(e.target.value); try { setPlaylist(new URL(e.target.value).pathname === '/playlist'); } catch { /* Keep the current choice while typing. */ } }} />
      <label className="download-choice"><input type="checkbox" checked={playlist} disabled={disabled} onChange={e => setPlaylist(e.target.checked)} /><span>Scarica tutta la playlist</span></label>
      <p>MP3 a 192 kbps, aggiunti direttamente alla libreria. Un brano alla volta, fino a 500 per playlist e 60 minuti o 200 MB per brano.</p>
      <button className="button primary" type="submit" disabled={disabled || !url.trim()}><Download size={18} />Scarica sul telefono</button>
    </form>
    {error && <p className="download-error" role="alert">{error}</p>}
    {state.stage && <section className="download-card" aria-label="Stato dei download">
      <div className="download-heading"><h2>{stages[state.stage] || 'Download'}</h2>{state.busy && <Loader2 size={20} className="download-spinner" aria-hidden="true" />}</div>
      <p role="status" aria-live="polite">{state.message || (current ? current.title : 'Puoi continuare a usare Onda.')}</p>
      {state.busy && state.stage !== 'cancelling' && <><progress aria-label={stages[state.stage] || 'Avanzamento'} max={100} value={(state.percent ?? -1) >= 0 ? state.percent : undefined} />{(state.percent ?? -1) >= 0 && <small>{state.percent}%</small>}</>}
      {!!entries.length && <p>{done} di {entries.length} completati · {state.added || 0} aggiunti · {state.duplicates || 0} già presenti · {state.failed || 0} non riusciti</p>}
      <div className="download-actions">
        {state.busy && <button type="button" className="button outline" disabled={pending || state.stage === 'cancelling'} onClick={() => void action('cancelMusicDownloads')}><Square size={16} />Annulla download</button>}
        {state.canResume && <button type="button" className="button outline" disabled={pending} onClick={() => void action('startMusicDownloads', { resume: true })}><RotateCcw size={16} />Riprendi i brani rimasti</button>}
      </div>
      {!!entries.length && <><ol className="download-queue">{entries.slice(0, limit).map(entry => <li key={entry.id}>
        <div className="download-entry-heading"><strong>{entry.title}</strong><span className={`download-badge ${entry.status}`}>{entry.status === 'added' && <Check size={14} aria-hidden="true" />}{labels[entry.status] || 'Da scaricare'}</span></div>
        {entry.note && <small>{entry.note}</small>}
      </li>)}</ol>{entries.length > limit && <button type="button" className="button outline small" onClick={() => setLimit(n => n + 30)}>Mostra altri brani ({limit} di {entries.length})</button>}</>}
    </section>}
    <details className="download-card download-settings"><summary>Metadati Last.fm {state.lastFmConfigured ? '· configurato' : '· facoltativi'}</summary>
      <p>Aggiungi la tua chiave Last.fm per cercare titolo, artista, album e tag. La chiave resta sul telefono ed è inviata soltanto a Last.fm. Se la ricerca non riesce, il download continua con i dati disponibili.</p>
      <form onSubmit={e => { e.preventDefault(); void action('configureMusicDownloads', { key }); }}>
        <label htmlFor="lastfm-key">Chiave API Last.fm</label>
        <input id="lastfm-key" type="password" autoComplete="off" spellCheck={false} value={key} maxLength={32} disabled={disabled} placeholder={state.lastFmConfigured ? 'Chiave salvata · inseriscine una per cambiarla' : 'Inserisci la tua chiave'} onChange={e => setKey(e.target.value)} />
        <div className="download-actions"><button type="submit" className="button outline" disabled={disabled || !key.trim()}>Salva chiave</button>{state.lastFmConfigured && <button type="button" className="button subtle" disabled={disabled} onClick={() => void action('configureMusicDownloads', { clear: true })}>Rimuovi chiave</button>}</div>
      </form>
      {notice && <p role="status">{notice}</p>}
    </details>
  </section>;
}
