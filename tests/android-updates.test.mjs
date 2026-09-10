import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { githubSource, nextVersion, packageUpdate, parseConfig, validateBuild } from '../scripts/android-release.mjs';
import ts from 'typescript';

const config = { versionCode: 3, versionName: '1.2.0', updateUrl: githubSource('example/onda') };
const metadata = { applicationId: 'it.onda.player', elements: [{ versionCode: 3, versionName: '1.2.0', outputFile: 'app-debug.apk' }] };

test('La sorgente usa HTTPS e non accetta credenziali o percorsi arbitrari', () => {
  assert.equal(config.updateUrl, 'https://github.com/example/onda/releases/latest/download/update.json');
  for (const repo of ['https://github.com/a/b', 'a/b/c', '../b', 'a/b.git', 'a/b\n', 'a/b?token=secret']) assert.throws(() => githubSource(repo));
  assert.throws(() => parseConfig('versionCode=2\nversionName=1.1.0\nupdateUrl=http://example.com/update.json'));
  assert.throws(() => parseConfig('versionCode=2\nversionName=1.1.0\nupdateUrl=https://user:secret@example.com/update.json'));
});

test('Una nuova release deve avanzare la versione e avere un tag diverso', () => {
  assert.equal(nextVersion(config, '4', '1.3.0').versionCode, 4);
  for (const code of ['2', '3', '4.1', '2100000001', '4\nversionCode=5']) assert.throws(() => nextVersion(config, code, '1.3.0'));
  assert.throws(() => nextVersion(config, '4', '1.2.0'));
});

test('La preparazione rifiuta APK di un’altra versione o applicazione', () => {
  assert.equal(validateBuild(metadata, config), 'app-debug.apk');
  assert.throws(() => validateBuild(metadata, { ...config, versionCode: 4 }));
  assert.throws(() => validateBuild({ ...metadata, applicationId: 'another.app' }, config));
  for (const outputFile of ['../other.apk', '..\\other.apk', 'index.html']) {
    assert.throws(() => validateBuild({ ...metadata, elements: [{ ...metadata.elements[0], outputFile }] }, config));
  }
});

test('Il manifest descrive i byte copiati e punta al tag immutabile', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'onda-release-'));
  try {
    const build = join(temp, 'build'); mkdirSync(build);
    // Fixture bytes test the packaging pipeline, not Android APK acceptance.
    const bytes = Buffer.from('APK fixture bytes\0\xff');
    writeFileSync(join(build, 'app-debug.apk'), bytes);
    writeFileSync(join(build, 'output-metadata.json'), JSON.stringify(metadata));
    writeFileSync(join(build, 'onda-build.json'), JSON.stringify({ applicationId: 'it.onda.player', ...config }));
    const output = join(temp, 'release');
    const manifest = await packageUpdate(config, build, output);
    assert.deepEqual(readFileSync(join(output, 'onda.apk')), bytes);
    assert.equal(manifest.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(manifest.sizeBytes, bytes.length);
    assert.equal(manifest.apkUrl, 'https://github.com/example/onda/releases/download/v1.2.0/onda.apk');
    assert.deepEqual(JSON.parse(readFileSync(join(output, 'update.json'), 'utf8')), manifest);
    await assert.rejects(packageUpdate(config, build, output), /già stata preparata/);
    await assert.rejects(packageUpdate({ ...config, updateUrl: githubSource('other/onda') }, build, join(temp, 'changed')), /configurazione è cambiata/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

const source = readFileSync(new URL('../mobile/update-state.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
const { updateView } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const state = { phase: 'idle', installedVersion: '1.1.0', receivedBytes: 0, error: '', downloadMessage: '' };

test('Stati senza rete o sorgente: niente installazione e possibilità di riprovare', () => {
  assert.equal(updateView({ ...state, phase: 'disabled' }).canCheck, false);
  assert.equal(updateView({ ...state, phase: 'disabled' }).canDownload, false);
  assert.equal(updateView({ ...state, phase: 'current' }).hasUpdate, false);
  assert.equal(updateView({ ...state, phase: 'error' }).canCheck, true);
  assert.equal(updateView({ ...state, phase: 'error' }).canDownload, false);
});

test('Download e verifica impediscono doppi avvii; file non valido può essere riscaricato', () => {
  const available = { ...state, version: '1.2.0', sizeBytes: 1024, phase: 'available' };
  assert.equal(updateView(available).canDownload, true);
  for (const phase of ['checking', 'downloading', 'verifying', 'ready']) assert.equal(updateView({ ...available, phase }).canDownload, false);
  assert.equal(updateView({ ...available, phase: 'downloading', receivedBytes: 512 }).percent, 50);
  assert.equal(updateView({ ...available, phase: 'downloading', receivedBytes: 2048 }).percent, 100);
  assert.equal(updateView({ ...available, phase: 'error' }).canDownload, true);
});

test('Il validatore Java rifiuta manifest e URL non validi', () => {
  const out = mkdtempSync(join(tmpdir(), 'onda-java-updates-'));
  try {
    execFileSync('java', ['-m', 'jdk.compiler/com.sun.tools.javac.Main', '-d', out,
      'android/app/src/main/java/it/onda/player/UpdateRelease.java', 'tests/java/UpdateReleaseCheck.java'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
    const result = execFileSync('java', ['-cp', out, 'it.onda.player.UpdateReleaseCheck'], { encoding: 'utf8' });
    assert.match(result, /All update manifest checks passed/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
