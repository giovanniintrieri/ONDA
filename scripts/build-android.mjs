import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const env = { ...process.env };
function run(program, args, cwd = root) {
  const result = spawnSync(program, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: false,
    windowsVerbatimArguments:
      windows && program.toLowerCase() === 'cmd.exe',
  });

  if (result.error) throw result.error;

  if (result.status !== 0) {
    throw new Error(
      `Comando non riuscito: ${program} (codice ${result.status})`
    );
  }
}
async function download(url, target) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok || !response.body) throw new Error(`Download non riuscito: ${response.status} ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
}
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Installa Node.js 22 o successivo.');
  const candidates = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT,
    windows && env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Android', 'Sdk') : join(homedir(), 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk')].filter(Boolean);
  const sdk = candidates.find(path => existsSync(join(path, 'platforms', 'android-36', 'android.jar')));
  if (!sdk) throw new Error('Apri Android Studio → SDK Manager e installa Android SDK Platform 36. Poi riprova.');
  env.ANDROID_HOME = sdk;
  if (!env.JAVA_HOME && windows) {
    const jbr = join(env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr');
    if (existsSync(join(jbr, 'bin', 'java.exe'))) env.JAVA_HOME = jbr;
  }
  if (!existsSync(join(root, 'node_modules', 'typescript', 'bin', 'tsc'))) {
    run(windows ? 'cmd.exe' : 'npm', windows ? ['/d', '/s', '/c', 'npm ci'] : ['ci']);
  }
  run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.android.json']);
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.android.config.ts']);
  const version = '8.13';
  const tools = join(root, '.android-tools');
  const gradle = join(tools, `gradle-${version}`, 'bin', windows ? 'gradle.bat' : 'gradle');
  if (!existsSync(gradle)) {
    mkdirSync(tools, { recursive: true });
    const url = `https://services.gradle.org/distributions/gradle-${version}-bin.zip`;
    const checksumResponse = await fetch(`${url}.sha256`);
    if (!checksumResponse.ok) throw new Error('Checksum Gradle non disponibile.');
    const expected = (await checksumResponse.text()).trim().split(/\s+/)[0];
    if (!/^[a-f0-9]{64}$/i.test(expected)) throw new Error('Checksum Gradle non valido.');
    const archive = join(tools, `gradle-${version}.zip`);
    console.log(`Scarico Gradle ${version} dal sito ufficiale…`);
    await download(url, archive + '.part');
    const actual = createHash('sha256').update(readFileSync(archive + '.part')).digest('hex');
    if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error('Verifica del download Gradle fallita.');
    renameSync(archive + '.part', archive);
    if (windows) {
      const extract = join(tools, 'extract-gradle.ps1');
      writeFileSync(extract, 'param([string]$Archive,[string]$Destination)\nExpand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force\n');
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', extract, '-Archive', archive, '-Destination', tools]);
    } else run('unzip', ['-q', '-o', archive, '-d', tools]);
  }
  if (windows) {
    // cmd receives a fixed command; paths are supplied through the process environment.
    env.ONDA_GRADLE = gradle;
    run('cmd.exe', ['/d', '/s', '/c', '""%ONDA_GRADLE%" --no-daemon assembleDebug"'], join(root, 'android'));
  } else run(gradle, ['--no-daemon', 'assembleDebug'], join(root, 'android'));
  console.log('\nAPK pronto: ' + join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'));
} catch (error) { console.error('\n' + (error instanceof Error ? error.message : String(error))); process.exitCode = 1; }
