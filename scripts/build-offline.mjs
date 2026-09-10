import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve('dist/client');
const assets = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(js|css|woff2?|png|svg|webmanifest)$/.test(entry.name) && entry.name !== 'sw.js') assets.push('/' + path.relative(root, full).split(path.sep).join('/'));
  }
}
await walk(root);
assets.sort();
const hash = createHash('sha256');
for (const asset of assets) { hash.update(asset); hash.update(await readFile(path.join(root, asset))); }
// Source shell changes must also produce a new cache version.
for (const file of ['app/page.tsx', 'app/layout.tsx', 'public/sw.js']) hash.update(await readFile(file));
const version = hash.digest('hex').slice(0, 16);
await writeFile(path.join(root, 'precache.json'), JSON.stringify({ version, assets }));
await writeFile(path.join(root, 'sw.js'), (await readFile('public/sw.js', 'utf8')).replaceAll('__ONDA_CACHE_VERSION__', version));
console.log(`Offline shell prepared: ${assets.length} local assets.`);
