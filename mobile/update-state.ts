export type AppUpdateState = {
  phase: 'disabled' | 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'verifying' | 'ready' | 'error';
  installedVersion: string;
  version?: string;
  receivedBytes: number;
  sizeBytes?: number;
  error: string;
  downloadMessage: string;
};

export function updateView(state: AppUpdateState | null) {
  const phase = state?.phase;
  const size = state?.sizeBytes ?? 0;
  const sizeLabel = `${(size / 1024 / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;
  const percent = size > 0 ? Math.max(0, Math.min(100, Math.floor((state!.receivedBytes || 0) * 100 / size))) : 0;
  const messages: Record<AppUpdateState['phase'], string> = {
    disabled: 'Gli aggiornamenti dall’app non sono disponibili in questa versione.',
    idle: 'Puoi controllare se è disponibile una nuova versione.',
    checking: 'Controllo degli aggiornamenti…',
    current: 'Onda è aggiornata.',
    available: `È disponibile Onda ${state?.version ?? ''}.`,
    downloading: state?.downloadMessage || 'Download in corso. Puoi continuare ad ascoltare musica.',
    verifying: 'Download completato.',
    ready: `Onda ${state?.version ?? ''} è pronta da installare.`,
    error: state?.error || 'Operazione non riuscita. Riprova.',
  };
  return {
    message: phase ? messages[phase] : 'Caricamento…', sizeLabel, percent,
    hasUpdate: !!state?.version && phase !== 'current' && phase !== 'disabled',
    canCheck: !!phase && ['idle', 'current', 'available', 'error'].includes(phase),
    canDownload: !!state?.version && (phase === 'available' || phase === 'error'),
  };
}
