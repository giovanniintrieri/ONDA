import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { request, subscribe } from './bridge';
import { updateView, type AppUpdateState } from './update-state';

export function DeviceSetup() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const notified = useRef('');

  useEffect(() => {
    let active = true;
    const accept = (value: AppUpdateState) => {
      if (!active) return;
      setState(value);
      setConnectionError('');
    };
    const unsubscribe = subscribe<AppUpdateState>('appUpdate', accept);
    void request<AppUpdateState>('updateState').then(accept).catch(() => {
      if (active) setConnectionError('Impossibile leggere lo stato degli aggiornamenti. Riapri Onda e riprova.');
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!state?.version || !['available', 'ready'].includes(state.phase)) return;
    const key = `${state.phase}:${state.version}`;
    if (notified.current === key) return;
    notified.current = key;
    toast(state.phase === 'ready' ? 'Aggiornamento pronto da installare' : `Onda ${state.version} è disponibile`, {
      id: 'onda-app-update',
      action: { label: 'Apri', onClick: () => setOpen(true) },
    });
  }, [state?.phase, state?.version]);

  async function run(method: string) {
    if (busy) return;
    setBusy(true);
    try { setState(await request<AppUpdateState>(method)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Operazione non riuscita. Riprova.'); }
    finally { setBusy(false); }
  }

  const view = updateView(state);
  return <>
    <button className={`local-chip device-button${view.hasUpdate ? ' update-available' : ''}`}
      onClick={() => setOpen(true)} aria-label={view.hasUpdate ? 'Aggiornamento di Onda disponibile' : 'Informazioni app e aggiornamenti'}>
      {view.hasUpdate ? <Download size={18} /> : <Smartphone size={18} />}<span className={view.hasUpdate ? 'install-button-label' : undefined}>{view.hasUpdate ? 'Aggiorna' : 'App'}</span>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="onda-dialog">
        <DialogHeader><DialogTitle>Onda per Android</DialogTitle>
          <DialogDescription>Musica e playlist sono salvate sul telefono. L’ascolto funziona anche senza connessione e a schermo bloccato.</DialogDescription>
        </DialogHeader>
        <section className="app-update-panel" aria-labelledby="app-update-heading">
          <div className="app-update-heading"><h3 id="app-update-heading">Aggiornamenti</h3>
            {state && <span>Versione {state.installedVersion}</span>}
          </div>
          <p role="status" aria-live="polite">{connectionError || view.message}</p>
          {state?.phase === 'downloading' && <>
            <Progress value={view.percent} aria-label="Download aggiornamento" />
            <p className="update-size">{view.percent}% · {view.sizeLabel}</p>
          </>}
          {state?.phase === 'verifying' && <p className="update-working"><Loader2 size={18} className="animate-spin" />Verifica del file scaricato…</p>}
          {state?.phase === 'ready' && <p className="update-help">L’installazione chiuderà Onda e interromperà l’ascolto. Brani e playlist resteranno sul telefono. Se Android richiede un permesso, autorizza Onda, torna qui e premi di nuovo Installa.</p>}
          <div className="app-update-actions">
            {view.canDownload && <button className="button primary" disabled={busy} onClick={() => void run('downloadUpdate')}><Download size={17} />Scarica aggiornamento · {view.sizeLabel}</button>}
            {state?.phase === 'ready' && <button className="button primary" disabled={busy} onClick={() => void run('installUpdate')}>Installa aggiornamento</button>}
            {view.canCheck && <button className="button outline" disabled={busy} onClick={() => void run('checkUpdate')}><RefreshCw size={16} />Controlla aggiornamenti</button>}
            {state?.phase === 'downloading' && <button className="button outline" disabled={busy} onClick={() => void run('cancelUpdate')}>Annulla download</button>}
          </div>
        </section>
        <p>I file importati vengono copiati nella memoria dell’app. Gli originali restano al loro posto.</p>
        <p>Disinstallare Onda o cancellarne i dati elimina la libreria dell’app.</p>
      </DialogContent>
    </Dialog>
  </>;
}
