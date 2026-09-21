import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, ExternalLink, Loader2, Music2, Search } from 'lucide-react';
import { request } from './bridge';
import './downloads.css';
import './search.css';

type Track = { title: string; artist: string; url: string };
type Results = { tracks: Track[]; page: number; hasMore: boolean };
type Downloads = { busy?: boolean; canResume?: boolean; lastFmConfigured?: boolean };
type Selection = { track: Track; url: string; message: string };

export function SearchPanel({ onDownloads }: { onDownloads: () => void }) {
  const [title, setTitle] = useState(''), [artist, setArtist] = useState('');
  const [query, setQuery] = useState({ title: '', artist: '' });
  const [results, setResults] = useState<Results | null>(null), [selection, setSelection] = useState<Selection | null>(null);
  const [downloads, setDownloads] = useState<Downloads | null>(null);
  const [error, setError] = useState(''), [stateError, setStateError] = useState(''), [pending, setPending] = useState('');
  const [replaceQueue, setReplaceQueue] = useState(false);
  const alive = useRef(true), operation = useRef(false), version = useRef(0);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selection) { selectedHeading.current?.focus({ preventScroll: true }); selectedHeading.current?.scrollIntoView({ block: 'center' }); }
  }, [selection?.track.url]);
  useEffect(() => {
    alive.current = true;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const state = await request<Downloads>('musicDownloadState');
        if (!stopped) { setDownloads(state); setStateError(''); }
      } catch { if (!stopped) setStateError('Stato dei download non disponibile. Riprova tra qualche istante.'); }
      finally { if (!stopped) timer = setTimeout(() => { if (document.visibilityState === 'visible') void poll(); }, 3000); }
    }
    const visibility = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); void poll(); } };
    void poll(); document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; alive.current = false; ++version.current; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  async function run(label: string, work: (current: () => boolean) => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setPending(label); setError('');
    const id = ++version.current, current = () => alive.current && id === version.current;
    try { await work(current); }
    catch (e) { if (current()) setError(e instanceof Error ? e.message : 'Operazione non riuscita. Riprova.'); }
    finally { operation.current = false; if (current()) setPending(''); }
  }
  function search(page = 1, next = { title: title.trim(), artist: artist.trim() }) {
    void run('search', async current => {
      setSelection(null); setReplaceQueue(false);
      const response = await request<Results>('searchLastFm', { ...next, page });
      if (current()) { setResults(response); setQuery(next); }
    });
  }
  function select(track: Track) {
    void run(track.url, async current => {
      setReplaceQueue(false); setSelection({ track, url: '', message: 'Cerco il collegamento YouTube…' });
      try {
        const response = await request<{ url: string; message: string }>('resolveLastFmTrack', { url: track.url });
        if (current()) setSelection({ track, ...response });
      } catch (e) {
        if (current()) setSelection({ track, url: '', message: 'Collegamento non recuperato. Puoi riprovare o aprire il brano su Last.fm.' });
        throw e;
      }
    });
  }
  function download() {
    if (!selection?.url) return;
    void run('download', async current => {
      await request('startMusicDownloads', { url: selection.url, playlist: false, fromSearch: true, replaceInterrupted: replaceQueue });
      if (current()) onDownloads();
    });
  }
  return <section className="downloads music-search" aria-label="Ricerca Last.fm">
    <form className="download-card" onSubmit={e => { e.preventDefault(); search(); }}>
      <label htmlFor="search-track">Titolo del brano</label>
      <input id="search-track" type="search" placeholder="Es. Believer" maxLength={300} required value={title} onChange={e => setTitle(e.target.value)} />
      <label htmlFor="search-artist">Artista <span className="search-optional">facoltativo</span></label>
      <input id="search-artist" type="text" placeholder="Es. Imagine Dragons" maxLength={300} value={artist} onChange={e => setArtist(e.target.value)} />
      <div className="download-actions"><button className="button primary" type="submit" disabled={!!pending || !title.trim() || !downloads?.lastFmConfigured}>
        {pending === 'search' ? <Loader2 size={18} className="download-spinner" /> : <Search size={18} />}{pending === 'search' ? 'Ricerca in corso…' : 'Cerca brani'}
      </button><button className="button subtle" type="button" onClick={onDownloads}>Hai già un link?</button></div>
      {downloads && !downloads.lastFmConfigured && <div className="search-notice"><p>Per cercare i brani, salva la tua chiave Last.fm nelle impostazioni di Scarica musica.</p><button className="button outline" type="button" onClick={onDownloads}>Configura Last.fm</button></div>}
    </form>
    {stateError && <p className="download-error" role="alert">{stateError}</p>}
    {error && <p className="download-error" role="alert">{error}</p>}
    {downloads?.busy && <div className="download-card"><p role="status">Un download è già in corso. Puoi continuare a cercare.</p><button className="button outline" onClick={onDownloads}>Mostra download</button></div>}
    {selection && <section className="download-card search-selection" aria-label="Brano selezionato">
      <p className="eyebrow">BRANO SELEZIONATO</p><h2 ref={selectedHeading} tabIndex={-1}>{selection.track.title}</h2><p>{selection.track.artist}</p>
      <p role="status">{selection.message}</p>
      {!!selection.url && <>
        <p className="search-video">{selection.url}</p>
        {downloads?.canResume && <label className="download-choice"><input type="checkbox" checked={replaceQueue} onChange={e => setReplaceQueue(e.target.checked)} /><span>Sostituisci la coda interrotta con questo brano. I brani già scaricati restano in libreria.</span></label>}
        <button className="button primary" disabled={!!pending || !downloads || !!stateError || !!downloads.busy || (!!downloads.canResume && !replaceQueue)} onClick={download}><Download size={18} />{pending === 'download' ? 'Avvio download…' : 'Scarica sul telefono'}</button>
      </>}
      <div className="download-actions search-links">
        <button className="button subtle" disabled={!!pending} onClick={() => void run('open', async () => { await request('openLastFmTrack', { url: selection.track.url }); })}><ExternalLink size={16} />Apri su Last.fm</button>
        {!selection.url && <><button className="button outline" disabled={!!pending} onClick={() => select(selection.track)}>Riprova collegamento</button><button className="button subtle" onClick={onDownloads}>Incolla link YouTube</button></>}
      </div>
    </section>}
    {results && <section className="download-card" aria-label="Risultati ricerca" aria-busy={pending === 'search'}>
      <div className="download-heading"><h2>Risultati per “{query.title}”</h2></div>
      {query.artist && <p>Artista: {query.artist}</p>}
      <p role="status">{results.tracks.length ? `${results.tracks.length} risultati · pagina ${results.page} · Last.fm` : 'Nessun brano trovato. Prova un altro titolo o modifica l’artista.'}</p>
      <ul className="search-results">{results.tracks.map(track => <li key={track.url}>
        <button className="search-result" disabled={!!pending} aria-pressed={selection?.track.url === track.url} onClick={() => select(track)}>
          <span className="search-note" aria-hidden="true"><Music2 size={22} /></span>
          <span className="search-track"><strong>{track.title}</strong><span>{track.artist}</span></span>
          {pending === track.url ? <Loader2 size={20} className="download-spinner" aria-label="Ricerca collegamento" /> : <ArrowRight size={20} aria-hidden="true" />}
        </button>
      </li>)}</ul>
      {(results.page > 1 || results.hasMore) && <nav className="download-actions search-pagination" aria-label="Pagine dei risultati">
        <button className="button outline" disabled={!!pending || results.page <= 1} onClick={() => search(results.page - 1, query)}><ArrowLeft size={16} />Precedente</button>
        <button className="button outline" disabled={!!pending || !results.hasMore} onClick={() => search(results.page + 1, query)}>Successiva<ArrowRight size={16} /></button>
      </nav>}
    </section>}
    {!results && !pending && <div className="search-intro"><Music2 size={30} aria-hidden="true" /><p>Cerca un brano, scegli il risultato e trova il collegamento YouTube per aggiungerlo alla tua libreria.</p></div>}
  </section>;
}
