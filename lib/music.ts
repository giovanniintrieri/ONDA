export type Track = {
  id: string; title: string; artist: string; album: string; genre: string;
  duration: number; size: number; format: string; filename: string; addedAt: number;
  liked: boolean; plays: number; skips: number; lastPlayed: number; cover?: Blob;
};
export type Playlist = { id: string; name: string; trackIds: string[]; createdAt: number };
export function formatTime(n: number) {
  if (!Number.isFinite(n) || n < 0) return '—';
  return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
}
export function formatSize(bytes: number) { return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`; }
export function coverColor(s: string) { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0; return n % 6; }
export const isAudio = (f: File) => /\.(mp3|mp4|m4a|flac|wav|aac|ogg|opus|aif|aiff)$/i.test(f.name) || f.type.startsWith('audio/');

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('onda-local-mp3', 1);
    req.onupgradeneeded = () => {
      for (const name of ['tracks', 'files', 'playlists', 'settings']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
    };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); dbPromise = null; }; resolve(req.result); };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error('Chiudi le altre schede di Onda e riprova.')); };
  });
  return dbPromise;
}
async function getAll<T>(store: string): Promise<T[]> {
  const d = await db(); return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readonly'), r = tx.objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
export async function loadLibrary() { const [tracks, playlists] = await Promise.all([getAll<Track>('tracks'), getAll<Playlist>('playlists')]); return { tracks, playlists }; }
export async function readAudio(id: string): Promise<Blob> {
  const d = await db(); return new Promise((resolve, reject) => {
    const r = d.transaction('files').objectStore('files').get(id);
    r.onsuccess = () => r.result?.file ? resolve(r.result.file) : reject(new Error('File locale non disponibile. Importalo di nuovo.'));
    r.onerror = () => reject(r.error);
  });
}
export async function editTrack(id: string, change: (track: Track) => Track): Promise<Track> {
  const d = await db(); return new Promise((resolve, reject) => {
    const tx = d.transaction('tracks', 'readwrite'), store = tx.objectStore('tracks'), r = store.get(id); let updated: Track;
    r.onsuccess = () => { if (!r.result) { tx.abort(); return; } updated = change(r.result); store.put(updated); };
    tx.oncomplete = () => resolve(updated); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Brano non disponibile.'));
  });
}
export async function savePlaylist(p: Playlist) {
  const d = await db(); return new Promise<void>((resolve, reject) => { const tx = d.transaction('playlists', 'readwrite'); tx.objectStore('playlists').put(p); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}
export async function removePlaylist(id: string) {
  const d = await db(); return new Promise<void>((resolve, reject) => { const tx = d.transaction('playlists', 'readwrite'); tx.objectStore('playlists').delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}
export async function removeTrack(id: string) {
  const d = await db(); return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(['tracks', 'files', 'playlists'], 'readwrite');
    tx.objectStore('tracks').delete(id); tx.objectStore('files').delete(id);
    const store = tx.objectStore('playlists'), r = store.openCursor();
    r.onsuccess = () => { const c = r.result; if (c) { const p = c.value as Playlist; if (p.trackIds.includes(id)) c.update({ ...p, trackIds: p.trackIds.filter(t => t !== id) }); c.continue(); } };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function importTrack(file: File, overrides: Partial<Track> = {}): Promise<Track | null> {
  if (!isAudio(file) || !file.size) throw new Error('Scegli un file audio valido.');
  const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  const id = Array.from(new Uint8Array(hash)).map(v => v.toString(16).padStart(2, '0')).join('');
  const d = await db();
  const exists = await new Promise<boolean>((resolve, reject) => { const r = d.transaction('tracks').objectStore('tracks').count(id); r.onsuccess = () => resolve(r.result > 0); r.onerror = () => reject(r.error); });
  if (exists) return null;
  const name = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  const parts = name.split(' - ');
  const track: Track = { id, title: parts.length > 1 ? parts.slice(1).join(' - ') : name, artist: parts.length > 1 ? parts[0] : 'Artista sconosciuto', album: '', genre: '', duration: 0, size: file.size, format: file.name.split('.').pop()?.toUpperCase() || 'AUDIO', filename: file.name, addedAt: Date.now(), liked: false, plays: 0, skips: 0, lastPlayed: 0 };
  try {
    const { parseBlob } = await import('music-metadata');
    const { common, format } = await parseBlob(file, { duration: false });
    if (!format.container) throw new Error('Formato audio non riconosciuto.');
    track.title = common.title || track.title; track.artist = common.artist || track.artist;
    track.album = common.album || ''; track.genre = common.genre?.[0] || '';
    track.duration = Number.isFinite(format.duration) ? format.duration! : 0;
    const picture = common.picture?.find(p => /image\/(jpeg|png|webp)/.test(p.format) && p.data.length <= 3_000_000);
    if (picture) track.cover = new Blob([new Uint8Array(picture.data)], { type: picture.format });
} catch (error) {
  console.error('[Onda][metadati]', file.name, error);

  const detail = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);

  throw new Error(`Lettura metadati fallita: ${detail}`, {
    cause: error,
  });
}
  Object.assign(track, overrides, { id });
  return new Promise((resolve, reject) => {
    const tx = d.transaction(['tracks', 'files'], 'readwrite');
    const r = tx.objectStore('tracks').get(id); let duplicate = false;
    r.onsuccess = () => { if (r.result) duplicate = true; else { tx.objectStore('tracks').add(track); tx.objectStore('files').add({ id, file }); } };
    tx.oncomplete = () => resolve(duplicate ? null : track); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}

export async function loadSetting<T>(id: string): Promise<T | null> {
  const d = await db(); return new Promise((resolve, reject) => {
    const r = d.transaction('settings').objectStore('settings').get(id);
    r.onsuccess = () => resolve(r.result?.value ?? null); r.onerror = () => reject(r.error);
  });
}
export async function saveSetting<T>(id: string, value: T): Promise<void> {
  const d = await db(); return new Promise((resolve, reject) => {
    const tx = d.transaction('settings', 'readwrite'); tx.objectStore('settings').put({ id, value });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
