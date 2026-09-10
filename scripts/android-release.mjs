import { createReadStream, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'android', 'release.properties');
export const MAX_APK_BYTES = 200 * 1024 * 1024;

export function githubSource(repository) {
  if (typeof repository !== 'string' || /[\r\n]/.test(repository) || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository)
      || repository.endsWith('.git')) {
    throw new Error('Indica il repository come proprietario/nome, senza URL e senza .git.');
  }
  return `https://github.com/${repository}/releases/latest/download/update.json`;
}

export function parseConfig(text) {
  const config = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const split = line.indexOf('=');
    if (split < 1) throw new Error('release.properties non valido.');
    config[line.slice(0, split).trim()] = line.slice(split + 1).trim();
  }
  if (!/^[1-9][0-9]*$/.test(config.versionCode ?? '') || Number(config.versionCode) > 2100000000) throw new Error('versionCode non valido.');
  if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(config.versionName ?? '')) throw new Error('versionName non valido.');
  if (config.updateUrl) {
    const url = new URL(config.updateUrl);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) throw new Error('La sorgente deve essere HTTPS senza credenziali.');
  }
  return { versionCode: Number(config.versionCode), versionName: config.versionName, updateUrl: config.updateUrl || '' };
}

function saveConfig(config) {
  const text = `# Configurazione Onda Android\nversionCode=${config.versionCode}\nversionName=${config.versionName}\nupdateUrl=${config.updateUrl}\n`;
  parseConfig(text);
  const temporary = configPath + '.tmp';
  writeFileSync(temporary, text);
  renameSync(temporary, configPath);
}

export function nextVersion(config, code, name) {
  if (/[\r\n]/.test(String(code)) || /[\r\n]/.test(String(name))) throw new Error('Versione non valida.');
  const next = parseConfig(`versionCode=${code}\nversionName=${name}\nupdateUrl=${config.updateUrl}\n`);
  if (next.versionCode <= config.versionCode) throw new Error(`Usa un versionCode maggiore di ${config.versionCode}.`);
  if (next.versionName === config.versionName) throw new Error('Scegli anche un nuovo nome versione e un nuovo tag GitHub.');
  return next;
}

export function validateBuild(metadata, config) {
  if (metadata.applicationId !== 'it.onda.player' || metadata.elements?.length !== 1) throw new Error('Serve un singolo APK completo di Onda.');
  const item = metadata.elements[0];
  if (item.versionCode !== config.versionCode || item.versionName !== config.versionName) {
    throw new Error('L’APK non corrisponde alla versione configurata. Esegui prima node scripts/build-android.mjs.');
  }
  if (typeof item.outputFile !== 'string' || item.outputFile !== basename(item.outputFile)
      || item.outputFile.includes('\\') || !item.outputFile.endsWith('.apk')) throw new Error('Percorso APK non valido.');
  return item.outputFile;
}

export async function packageUpdate(config, buildDirectory, outputDirectory) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/latest\/download\/update\.json$/.exec(config.updateUrl);
  if (!match || githubSource(match[1]) !== config.updateUrl) throw new Error('Configura prima il repository con il comando configure.');
  const metadata = JSON.parse(readFileSync(join(buildDirectory, 'output-metadata.json'), 'utf8'));
  const stamp = JSON.parse(readFileSync(join(buildDirectory, 'onda-build.json'), 'utf8'));
  if (stamp.applicationId !== 'it.onda.player' || stamp.versionCode !== config.versionCode
      || stamp.versionName !== config.versionName || stamp.updateUrl !== config.updateUrl) {
    throw new Error('La configurazione è cambiata dopo la build. Esegui prima node scripts/build-android.mjs.');
  }
  const fileName = validateBuild(metadata, config);
  const source = join(buildDirectory, fileName);
  const sizeBytes = statSync(source).size;
  if (sizeBytes < 1 || sizeBytes > MAX_APK_BYTES) throw new Error('Dimensione APK non valida (limite 200 MiB).');
  if (existsSync(outputDirectory)) throw new Error('Questa versione è già stata preparata. Usa una nuova versione: gli aggiornamenti pubblicati non vanno sovrascritti.');
  mkdirSync(outputDirectory, { recursive: true });
  const destination = join(outputDirectory, 'onda.apk');
  copyFileSync(source, destination);
  if (statSync(destination).size !== sizeBytes) throw new Error('L’APK è cambiato durante la preparazione. Ripeti con una build completata.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(destination)) hash.update(chunk);
  const manifest = {
    applicationId: 'it.onda.player', versionCode: config.versionCode, versionName: config.versionName,
    minSdk: 26, sizeBytes: statSync(destination).size, sha256: hash.digest('hex'),
    apkUrl: `https://github.com/${match[1]}/releases/download/v${encodeURIComponent(config.versionName)}/onda.apk`,
  };
  writeFileSync(join(outputDirectory, 'update.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const config = parseConfig(readFileSync(configPath, 'utf8'));
  if (command === 'configure' && args.length === 1) {
    config.updateUrl = githubSource(args[0]); saveConfig(config);
    console.log(`Aggiornamenti collegati a ${args[0]}. Ricompila l’APK per includere questa configurazione.`);
  } else if (command === 'version' && args.length === 2) {
    const next = nextVersion(config, args[0], args[1]); saveConfig(next);
    console.log(`Nuova versione: ${next.versionName} (${next.versionCode}). Ora esegui node scripts/build-android.mjs.`);
  } else if (command === 'package' && args.length === 0) {
    const output = join(root, 'android', 'releases', `v${config.versionName}`);
    const manifest = await packageUpdate(config, join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug'), output);
    console.log(`File pronti in ${output}\nCrea una GitHub Release con tag v${manifest.versionName}, allega onda.apk e update.json e impostala come Latest.\nNessun file è stato caricato online.`);
  } else {
    throw new Error('Comandi:\n  node scripts/android-release.mjs configure proprietario/repository\n  node scripts/android-release.mjs version 3 1.2.0\n  node scripts/android-release.mjs package');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
