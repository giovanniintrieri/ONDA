import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const pending = [];

function update(file, replacements) {
  const path = join(root, file);
  const original = readFileSync(path, 'utf8');
  let text = original.replace(/\r\n/g, '\n');

  for (const [before, after] of replacements) {
    if (after && text.includes(after)) continue;

    if (!text.includes(before)) {
      if (!after) continue;
      throw new Error('Contenuto diverso dallo ZIP: ' + file);
    }

    text = text.replaceAll(before, () => after);
  }

  if (text !== original.replace(/\r\n/g, '\n')) {
    pending.push({ file, path, original, text });
  }
}

update("scripts/build-android.mjs", [
  [
    "import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';",
    "import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';"
  ],
  [`      const extract = join(tools, 'extract-gradle.ps1');
      writeFileSync(extract, 'param([string]$Archive,[string]$Destination)\\nExpand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force\\n');
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', extract, '-Archive', archive, '-Destination', tools]);
`, `      run('tar.exe', ['-xf', archive, '-C', tools]);
`],
]);

update("vite.android.config.ts", [
  [
    "  build: { outDir: path('./android/app/src/main/assets/ui'), emptyOutDir: true, target: 'es2020', sourcemap: false },",
    `  build: {
    outDir: path('./android/app/src/main/assets/ui'),
    emptyOutDir: true,
    target: 'es2020',
    cssTarget: 'chrome111',
    sourcemap: false,
  },`
  ],
]);

update("mobile/native.css", [
  [`  .onda-dialog {
    top: auto;
    bottom: 10px;
    left: 50%;
    width: calc(100% - 20px);
    max-width: 560px;
    max-height: calc(100vh - 20px);
    max-height: calc(100dvh - 20px);
    translate: -50% 0;
    transform: none;
    padding: 18px;
    gap: 14px;
    border-radius: 20px;
    animation: none;
    overscroll-behavior: contain;
  }`, `  .onda-dialog {
    --tw-translate-x: 0px;
    --tw-translate-y: 0px;
    position: fixed;
    top: auto;
    bottom: 10px;
    left: 10px;
    right: 10px;
    width: auto;
    max-width: 560px;
    height: auto;
    min-height: 0;
    max-height: calc(100vh - 20px);
    max-height: calc(100dvh - 20px);
    margin: 0 auto;
    translate: none;
    transform: none;
    padding: 18px;
    gap: 14px;
    border-radius: 20px;
    animation: none;
    overscroll-behavior: contain;
  }

  .onda-dialog.playlist-dialog {
    top: 10px;
    bottom: 10px;
    max-height: none;
  }`],
]);

update("mobile/mobile-player.css", [
  [`.onda-now-playing-dialog[data-slot="dialog-content"] {
  position: fixed;`, `.onda-now-playing-dialog[data-slot="dialog-content"] {
  --tw-translate-x: 0px;
  --tw-translate-y: 0px;
  position: fixed;`],
]);

update("mobile/Home.tsx", [
  [
    "  function nav(v: View) { go(v); setOpenMobile(false); }",
    `  function nav(v: View) { go(v); setOpenMobile(false); }
  function openCreate() { setOpenMobile(false); onCreate(); }
  function openInfo() { setOpenMobile(false); onInfo(); }`
  ],
  ["onClick={onCreate}", "onClick={openCreate}"],
  ["onClick={onInfo}", "onClick={openInfo}"],
  [
    "    const playerElement = useRef<HTMLDivElement>(null);",
    `  const playerElement = useRef<HTMLDivElement>(null);
  const playlistTitleRef = useRef<HTMLHeadingElement>(null);`
  ],
  [
    '      <DialogContent className="onda-dialog playlist-dialog">',
    `      <DialogContent
        className="onda-dialog playlist-dialog"
        onOpenAutoFocus={event => {
          event.preventDefault();
          playlistTitleRef.current?.focus({ preventScroll: true });
        }}
      >`
  ],
  [
    "          <DialogTitle>Nuova playlist</DialogTitle>",
    `          <DialogTitle ref={playlistTitleRef} tabIndex={-1}>
            Nuova playlist
          </DialogTitle>`
  ],
  ["                autoFocus\n", ""],
]);

update("mobile/main.tsx", [
  [`import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from './Home';
import '../app/globals.css';
import './native.css';
import './native.css';
import './mobile-player.css';
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main style={{ padding: 24, color: '#edf2e5' }}><h1>Onda non riesce ad aprirsi</h1><p>{this.state.error}</p><button onClick={() => location.reload()}>Riprova</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><Home /></ErrorBoundary>);
`, `import React from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import './native.css';
import './mobile-player.css';

const Home = React.lazy(() => import('./Home'));

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error
        ? error.name + ': ' + error.message
        : String(error),
    };
  }

  render() {
    if (this.state.error !== null) {
      return (
        <main role="alert" style={{ padding: 24, color: '#edf2e5' }}>
          <h1>Onda non riesce ad aprirsi</h1>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {this.state.error}
          </p>
          <button type="button" className="button primary" onClick={() => location.reload()}>
            Riprova
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <React.Suspense fallback={
      <main role="status" style={{ padding: 24, color: '#edf2e5' }}>
        Avvio di Onda…
      </main>
    }>
      <Home />
    </React.Suspense>
  </ErrorBoundary>,
);
`],
]);

update("mobile/index.html", [
  [
    '<body class="antialiased"><div id="root"></div><script type="module" src="./main.tsx"></script></body>',
    `<body class="antialiased" style="background: #141615; color: #edf2e5">
  <div id="root">
    <p role="status" style="padding: 24px">Avvio di Onda…</p>
  </div>
  <script type="module" src="./main.tsx"></script>
</body>`
  ],
]);

const backup = join(root, '.android-tools', 'backup-ui-' + Date.now());

for (const { file, path, original, text } of pending) {
  const saved = join(backup, file);
  mkdirSync(dirname(saved), { recursive: true });
  writeFileSync(saved, original);
  writeFileSync(
    path,
    original.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text
  );
  console.log('Corretto: ' + file);
}

console.log(
  pending.length ? 'Backup: ' + backup : 'Correzioni già applicate.'
);