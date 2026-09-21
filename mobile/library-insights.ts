import type { Track } from './music';

const DAY = 86_400_000;
export const AUTO_PLAYLISTS = [
  { id: 'auto:recent', name: 'Aggiunti di recente', description: 'I brani importati negli ultimi 30 giorni, dal più recente.' },
  { id: 'auto:unplayed', name: 'Mai ascoltati', description: 'Brani senza ascolti registrati: almeno 30 secondi, o metà brano se più breve.' },
  { id: 'auto:most', name: 'Più ascoltati', description: 'I tuoi 50 brani con più ascolti registrati.' },
  { id: 'auto:forgotten', name: 'Dimenticati', description: 'Brani già ascoltati, ma non negli ultimi 30 giorni.' },
] as const;

export function automaticTracks(tracks: Track[], id: string, now = Date.now()): Track[] {
  const unique = [...new Map(tracks.map(t => [t.id, t])).values()];
  const tie = (a: Track, b: Track) => a.id.localeCompare(b.id);
  switch (id) {
    case 'auto:recent': return unique.filter(t => t.addedAt >= now - 30 * DAY && t.addedAt <= now).sort((a, b) => b.addedAt - a.addedAt || tie(a, b));
    case 'auto:unplayed': return unique.filter(t => !t.plays).sort((a, b) => b.addedAt - a.addedAt || tie(a, b));
    case 'auto:most': return unique.filter(t => t.plays > 0).sort((a, b) => b.plays - a.plays || b.lastPlayed - a.lastPlayed || tie(a, b)).slice(0, 50);
    case 'auto:forgotten': return unique.filter(t => t.plays > 0 && t.lastPlayed > 0 && t.lastPlayed < now - 30 * DAY).sort((a, b) => a.lastPlayed - b.lastPlayed || tie(a, b));
    default: return [];
  }
}

// Preserve punctuation and version suffixes (live, remix, remaster...).
export const duplicateText = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
export function duplicateGroups(tracks: Track[]): Track[][] {
  const buckets = new Map<string, Track[]>();
  for (const t of new Map(tracks.map(t => [t.id, t])).values()) {
    const title = duplicateText(t.title), artist = duplicateText(t.artist);
    if (!title || !artist || artist === 'artista sconosciuto' || artist === 'unknown artist' || !Number.isFinite(t.duration) || t.duration <= 0) continue;
    const key = JSON.stringify([title, artist]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(t); buckets.set(key, bucket);
  }
  const groups: Track[][] = [];
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.duration - b.duration || a.id.localeCompare(b.id));
    let group: Track[] = [];
    for (const t of bucket) {
      if (group.length && t.duration - group[0].duration > 2) {
        if (group.length > 1) groups.push(group);
        group = [];
      }
      group.push(t);
    }
    if (group.length > 1) groups.push(group);
  }
  return groups.sort((a, b) => a[0].title.localeCompare(b[0].title));
}
