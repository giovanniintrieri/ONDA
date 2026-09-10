import { request } from './bridge';
export type Track = {
  id: string; title: string; artist: string; album: string; genre: string;
  duration: number; size: number; format: string; filename: string; addedAt: number;
  liked: boolean; plays: number; skips: number; lastPlayed: number; coverUrl?: string;
};
export type Playlist = { id: string; name: string; trackIds: string[]; createdAt: number };
export function formatTime(n: number) { return !Number.isFinite(n) || n < 0 ? '—' : `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`; }
export function formatSize(bytes: number) { return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`; }
export function coverColor(s: string) { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0; return n % 6; }
export const isAudio = (f: File) => /\.(mp3|mp4|m4a|flac|wav|aac|ogg|opus|aif|aiff)$/i.test(f.name) || f.type.startsWith('audio/');
export const loadLibrary = () => request<{ tracks: Track[]; playlists: Playlist[] }>('library');
export async function editTrack(id: string, change: (t: Track) => Track) {
  const current = await request<Track>('track', { id });
  const updated = change(current);
  // Playback statistics belong to the native service, never overwrite them from UI snapshots.
  return request<Track>('editTrack', { id, title: updated.title, artist: updated.artist, album: updated.album, genre: updated.genre, liked: updated.liked });
}
export const savePlaylist = (playlist: Playlist) => request('savePlaylist', { playlist });
export const removePlaylist = (id: string) => request('removePlaylist', { id });
export const removeTrack = (id: string) => request('removeTrack', { id });
export const loadSetting = <T>(id: string) => request<T | null>('loadSetting', { id });
export const saveSetting = <T>(id: string, value: T) => request('saveSetting', { id, value });
export async function importTrack(file: File, overrides: Partial<Track> = {}): Promise<Track | null> {
  const { token } = await request<{ token: string }>('beginImport', { filename: file.name });
  try {
    for (let offset = 0; offset < file.size; offset += 128 * 1024) {
      const bytes = new Uint8Array(await file.slice(offset, offset + 128 * 1024).arrayBuffer());
      let binary = ''; for (const value of bytes) binary += String.fromCharCode(value);
      await request('appendImport', { token, data: btoa(binary) });
    }
    return await request<Track | null>('finishImport', { token, overrides }, 120_000);
  } catch (error) { await request('cancelImport', { token }).catch(() => {}); throw error; }
}
