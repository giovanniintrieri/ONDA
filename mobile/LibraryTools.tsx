import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { request } from './bridge';
import { uiErrorReport } from './diagnostic-log';
import { duplicateGroups } from './library-insights';
import { formatSize, formatTime, type Track } from './music';

export function DiagnosticsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [report, setReport] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError('');
    void request<string>('diagnostics', { uiErrors: uiErrorReport() }).then(value => { if (active) setReport(value); })
      .catch(() => { if (active) setError('Rapporto non disponibile. Riprova.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, revision]);
  async function copy() {
    try { await request('copyDiagnostics', { uiErrors: uiErrorReport() }); toast.success('Rapporto copiato. Puoi incollarlo in un messaggio.'); }
    catch { toast.error('Copia non riuscita. Riprova.'); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="onda-dialog library-tools-dialog">
    <DialogHeader><DialogTitle>Diagnostica dal telefono</DialogTitle><DialogDescription>Stato dell’app ed errori recenti. Il rapporto resta sul dispositivo finché non lo condividi.</DialogDescription></DialogHeader>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Preparazione rapporto…</p> : <pre className="diagnostics-report">{report}</pre>}
    <div className="tools-actions"><button className="button outline" disabled={loading} onClick={() => setRevision(n => n + 1)}>Aggiorna</button><button className="button primary" disabled={loading || !report || !!error} onClick={() => void copy()}>Copia rapporto</button></div>
  </DialogContent></Dialog>;
}

export function DuplicatesDialog({ open, onOpenChange, tracks, onRefresh, onPlay }: {
  open: boolean; onOpenChange: (open: boolean) => void; tracks: Track[]; onRefresh: () => Promise<void>; onPlay: (track: Track) => void;
}) {
  const groups = useMemo(() => open ? duplicateGroups(tracks) : [], [open, tracks]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]), [keepId, setKeepId] = useState(''), [removeIds, setRemoveIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [limit, setLimit] = useState(20);
  useEffect(() => { if (!open) { setSelectedIds([]); setKeepId(''); setRemoveIds([]); setLimit(20); setConfirm(false); } }, [open]);
  const selected = selectedIds.map(id => tracks.find(t => t.id === id)).filter((t): t is Track => !!t);
  const keep = selected.find(t => t.id === keepId);
  const removed = selected.filter(t => removeIds.includes(t.id) && t.id !== keepId);
  function chooseGroup(group: Track[]) { setSelectedIds(group.map(t => t.id)); setKeepId(group[0].id); setRemoveIds(group.slice(1).map(t => t.id)); }
  function chooseKeep(id: string) { setRemoveIds(old => [...new Set([...old.filter(x => x !== id), keepId])]); setKeepId(id); }
  async function merge() {
    if (busy || !keep || !removed.length) return;
    setBusy(true);
    try {
      await request('mergeTracks', { keepId, removeIds: removed.map(t => t.id) });
      setConfirm(false); setSelectedIds([]); await onRefresh();
      toast.success('Copie unite. Playlist, preferiti e statistiche conservati.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unione non riuscita.'); }
    finally { setBusy(false); }
  }
  return <><Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}><DialogContent className="onda-dialog library-tools-dialog">
    <DialogHeader><DialogTitle>Possibili duplicati</DialogTitle><DialogDescription>Stesso titolo e artista, durata entro 2 secondi. Ascolta le copie prima di scegliere: potrebbero essere registrazioni diverse.</DialogDescription></DialogHeader>
    <div className="tools-scroll">
      {selected.length > 0 ? <>
        <button className="text-button" disabled={busy} onClick={() => setSelectedIds([])}>← Torna ai gruppi</button>
        <h3>{selected[0].title} · {selected[0].artist}</h3>
        <p>Scegli la copia da mantenere e seleziona quelle da unire.</p>
        {selected.map(t => <article className="duplicate-copy" key={t.id}>
          <strong>{t.filename}</strong><span>{t.album || 'Album non indicato'}</span>
          <small>{t.format} · {formatTime(t.duration)} · {formatSize(t.size)} · {t.plays} ascolti{t.liked ? ' · Preferito' : ''}</small>
          <div className="tools-actions"><label><input type="radio" name="keep-copy" checked={keepId === t.id} disabled={busy} onChange={() => chooseKeep(t.id)} />Mantieni questa copia</label><button className="button outline small" disabled={busy} onClick={() => onPlay(t)}>Ascolta</button></div>
          {keepId !== t.id && <label><input type="checkbox" checked={removeIds.includes(t.id)} disabled={busy} onChange={e => setRemoveIds(old => e.target.checked ? [...old, t.id] : old.filter(id => id !== t.id))} />Unisci e rimuovi questa copia dalla libreria</label>}
        </article>)}
        <p>I file originali del telefono restano intatti. Formato e dimensione da soli non garantiscono la qualità audio.</p>
      </> : <>
        <p>{groups.length ? `${groups.length} gruppi da verificare.` : 'Nessun possibile duplicato trovato.'} I file identici sono già esclusi durante l’importazione.</p>
        {groups.slice(0, limit).map(group => <button className="duplicate-group" key={group[0].id} onClick={() => chooseGroup(group)}><strong>{group[0].title}</strong><span>{group[0].artist} · {group.length} copie</span><small>Confronta le copie →</small></button>)}
        {groups.length > limit && <button className="button outline" onClick={() => setLimit(n => n + 20)}>Mostra altri gruppi</button>}
      </>}
    </div>
    {!!selected.length && <button className="button primary" disabled={busy || !keep || !removed.length} onClick={() => setConfirm(true)}>Unisci {removed.length} {removed.length === 1 ? 'copia' : 'copie'} · {formatSize(removed.reduce((n, t) => n + t.size, 0))}</button>}
  </DialogContent></Dialog>
  <AlertDialog open={confirm} onOpenChange={value => { if (!busy) setConfirm(value); }}><AlertDialogContent className="onda-dialog"><AlertDialogHeader><AlertDialogTitle>Unire le copie selezionate?</AlertDialogTitle><AlertDialogDescription>Resterà “{keep?.filename}”. Verranno rimosse {removed.length} copie dalla memoria privata di Onda; playlist, preferiti e statistiche saranno associati al brano mantenuto. I file originali non saranno modificati.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel><AlertDialogAction disabled={busy || !keep || !removed.length} onClick={event => { event.preventDefault(); void merge(); }}>{busy ? 'Unione…' : 'Conferma unione'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
