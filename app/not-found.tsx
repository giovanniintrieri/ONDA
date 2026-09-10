import { AudioLines } from 'lucide-react';

export default function NotFound() {
  return <main className="missing-page"><AudioLines size={46} aria-hidden="true" /><p className="eyebrow">ONDA</p><h1>Torniamo alla musica.</h1><p>Questa pagina non è disponibile. Apri la schermata iniziale per continuare.</p><a href="/" className="button primary" target="_top">Apri Onda</a></main>;
}
