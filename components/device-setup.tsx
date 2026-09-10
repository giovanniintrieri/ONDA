'use client';
import { useEffect, useState } from 'react';
import { Check, Download, HardDrive, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Device = 'firefox-android' | 'android' | 'ios' | 'desktop' | 'embedded';
const instructions: Record<Device, { title: string; steps: string[] }> = {
  'firefox-android': { title: 'Installa da Firefox', steps: ['Apri il menu ⋮ di Firefox, accanto alla barra degli indirizzi.', 'Tocca Installa. Si apre il pannello Aggiungi a schermata Home.', 'Conferma con Aggiungi automaticamente, oppure trascina l’icona sulla Home.'] },
  android: { title: 'Installa dal browser', steps: ['Apri il menu ⋮ del browser.', 'Scegli Installa app, oppure Installa e crea scorciatoia → Installa. La voce può chiamarsi Aggiungi a schermata Home.', 'Conferma: troverai Onda tra le icone del telefono.'] },
  ios: { title: 'Aggiungi Onda alla Home', steps: ['Apri questa pagina in Safari.', 'Tocca Condividi, poi Aggiungi a Home. Se necessario scorri le azioni disponibili.', 'Conferma con Aggiungi e apri Onda dalla nuova icona.'] },
  desktop: { title: 'Aggiungi Onda alle tue app', steps: ['Cerca l’icona di installazione nella barra degli indirizzi o la voce per installare il sito nel menu del browser.', 'Se il browser non offre l’installazione, puoi usare Onda da questa pagina.', 'Per averla sul telefono, apri lo stesso link dal browser del telefono.'] },
  embedded: { title: 'Apri Onda nel browser', steps: ['Apri il menu della finestra e scegli Apri nel browser, oppure copia il link qui sotto.', 'Apri il link in Firefox o Chrome su Android, oppure in Safari su iPhone.', 'Accedi con il tuo account e usa la voce Installa o Aggiungi a Home del browser.'] },
};

export function DeviceSetup() {
  const [open, setOpen] = useState(false), [installed, setInstalled] = useState(false);
  const [device, setDevice] = useState<Device>('desktop'), [appUrl, setAppUrl] = useState('');
  const [promptEvent, setPromptEvent] = useState<InstallPrompt | null>(null), [prompting, setPrompting] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [offline, setOffline] = useState<'preparing' | 'ready' | 'error'>('preparing');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [persistent, setPersistent] = useState(false), [persistMessage, setPersistMessage] = useState(''), [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let active = true;
    const cleanups: (() => void)[] = [];
    const agent = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
    setDevice(window.self !== window.top || /; wv\)|FBAN|FBAV|Instagram/.test(agent) ? 'embedded' : ios ? 'ios' : /Android/.test(agent) ? /Firefox\//.test(agent) ? 'firefox-android' : 'android' : 'desktop');
    setAppUrl(window.location.origin + '/');
    const prompt = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallPrompt); setInstallMessage(''); };
    const installedEvent = () => { setInstalled(true); setPromptEvent(null); setInstallMessage('Onda è stata aggiunta alle tue app.'); };
    const media = matchMedia('(display-mode: standalone)');
    const displayChanged = () => setInstalled(media.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    displayChanged();
    media.addEventListener('change', displayChanged);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installedEvent);
    navigator.storage?.persisted?.().then(value => { if (active) setPersistent(value); }).catch(() => {});

    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(registration => {
        if (!active) return;
        if (registration.active?.state === 'activated') setOffline('ready');
        const offerUpdate = () => {
          setUpdateAvailable(true);
          toast.info('È disponibile una nuova versione di Onda.', {
            id: 'onda-app-update', duration: Infinity,
            action: { label: 'Aggiorna', onClick: () => window.location.assign('/aggiorna') },
          });
        };
        if (registration.waiting) offerUpdate();
        const observe = (worker: ServiceWorker | null) => {
          if (!worker) return;
          const changed = () => {
            if (!active) return;
            if (worker.state === 'installed' && registration.active) offerUpdate();
            if (worker.state === 'activated') setOffline('ready');
            if (worker.state === 'redundant' && !registration.active) setOffline('error');
          };
          worker.addEventListener('statechange', changed);
          cleanups.push(() => worker.removeEventListener('statechange', changed));
          changed();
        };
        observe(registration.installing || registration.waiting || registration.active);
        const found = () => observe(registration.installing);
        registration.addEventListener('updatefound', found);
        cleanups.push(() => registration.removeEventListener('updatefound', found));
        let lastCheck = Date.now();
        const checkUpdate = () => {
          if (document.hidden || !navigator.onLine || registration.installing || Date.now() - lastCheck < 60000) return;
          lastCheck = Date.now();
          void registration.update().catch(() => {});
        };
        document.addEventListener('visibilitychange', checkUpdate);
        window.addEventListener('online', checkUpdate);
        cleanups.push(() => { document.removeEventListener('visibilitychange', checkUpdate); window.removeEventListener('online', checkUpdate); });
      }).catch(() => { if (active) setOffline('error'); });
    } else setOffline('error');
    return () => {
      active = false;
      media.removeEventListener('change', displayChanged);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installedEvent);
      cleanups.forEach(cleanup => cleanup());
      toast.dismiss('onda-app-update');
    };
  }, []);

  async function install() {
    if (!promptEvent || prompting) return;
    const event = promptEvent;
    setPromptEvent(null);
    setPrompting(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      // Acceptance starts installation; only appinstalled/standalone confirms it.
      setInstallMessage(choice.outcome === 'accepted' ? 'Installazione avviata. Attendi la conferma del browser.' : 'Installazione annullata. Puoi riprovare dal menu del browser.');
    } catch { setInstallMessage('Il browser non ha aperto l’installazione. Segui i passaggi qui sotto.'); }
    finally { setPrompting(false); }
  }
  async function protect() {
    setRequesting(true);
    try { const granted = await navigator.storage?.persist?.(); setPersistent(!!granted); setPersistMessage(granted ? 'Il browser proteggerà i dati dalla pulizia automatica dello spazio.' : 'Il browser non ha concesso la protezione. Conserva anche i file originali.'); }
    catch { setPersistMessage('Protezione non disponibile in questo browser. Conserva anche i file originali.'); }
    finally { setRequesting(false); }
  }
  const help = instructions[device];
  return <>
    <button className="local-chip device-button" onClick={() => setOpen(true)} aria-label={installed ? 'App e ascolto offline' : 'Installa Onda sul dispositivo'}>
      {installed ? <Smartphone size={18} /> : <Download size={18} />}<span className="install-button-label">{installed ? 'App' : 'Installa'}</span>
    </button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="onda-dialog"><DialogHeader><DialogTitle>{installed ? 'Onda è sul tuo dispositivo' : 'Installa Onda'}</DialogTitle><DialogDescription>Questa versione si aggiunge alla Home dal browser. Musica e preferenze restano sul dispositivo.</DialogDescription></DialogHeader>
      {installed ? <div className="installation-confirmation"><Check size={20} /><span>App installata</span></div> : <>
        {(promptEvent || prompting) && <button className="button primary" onClick={() => void install()} disabled={prompting}>{prompting ? <Loader2 className="spin" size={18} /> : <Download size={18} />}{prompting ? 'Apertura installazione…' : 'Installa Onda'}</button>}
        {installMessage && <p className="install-message" role="status">{installMessage}</p>}
        <div className="installation-guide"><h3>{help.title}</h3>{device === 'firefox-android' && <p>In Firefox l’installazione si avvia dal menu del browser.</p>}<ol>{help.steps.map(step => <li key={step}>{step}</li>)}</ol>
          {device === 'embedded' && <a className="install-app-link" href={appUrl || '/'} target="_top">{appUrl || 'Apri Onda nel browser'}</a>}
        </div>
      </>}
      <div className="device-status">{offline === 'preparing' ? <Loader2 className="spin" size={22} /> : offline === 'ready' ? <Check size={22} /> : <HardDrive size={22} />}<div><strong>{offline === 'ready' ? 'Pronta per l’ascolto offline' : offline === 'preparing' ? 'Preparazione per l’offline…' : 'Avvio offline non ancora disponibile'}</strong><p>{offline === 'ready' ? 'Puoi ascoltare i file importati senza connessione, finché i dati del sito sono conservati.' : 'Tieni l’app aperta con una connessione attiva. Se la preparazione non riesce, riaprila e riprova.'}</p></div></div>
      <div className="storage-help"><h3>Conserva la tua libreria</h3><p>Cancellare i dati del sito elimina brani, playlist e regole di Onda. I file originali restano intatti. La libreria non si trasferisce automaticamente a un altro telefono.</p><button className="button outline" onClick={() => void protect()} disabled={persistent || requesting}>{persistent ? <Check size={17} /> : <HardDrive size={17} />}{persistent ? 'Memoria protetta' : requesting ? 'Richiesta…' : 'Proteggi la memoria locale'}</button>{persistMessage && <p role="status">{persistMessage}</p>}</div>
      <div className="storage-help"><h3>Aggiornamenti</h3><p>{updateAvailable ? 'La nuova versione è pronta. Aprila quando vuoi interrompere l’ascolto.' : 'Se continui a vedere una versione precedente, scarica l’aggiornamento da qui.'}</p><a className="button outline" href="/aggiorna"><RefreshCw size={17} />Aggiorna Onda</a></div>
      <p className="install-help">La riproduzione a schermo bloccato dipende dal browser e dal sistema operativo. Un eventuale rinnovo dell’accesso al sito può richiedere internet.</p>
    </DialogContent></Dialog>
  </>;
}
