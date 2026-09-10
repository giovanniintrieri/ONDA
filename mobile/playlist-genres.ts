type GenreTrack = { id: string; genre?: string | null };
export type PlaylistGenre = { key: string; label: string; count: number };

function genreLabel(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function genreKey(value: string | null | undefined): string {
  return genreLabel(value).toLocaleLowerCase('it-IT');
}

// Compound names (for example R&B or Pop/Rock) remain exactly one genre.
export function playlistGenres(tracks: readonly GenreTrack[]): PlaylistGenre[] {
  const groups = new Map<string, PlaylistGenre>();
  const seen = new Set<string>();
  for (const track of tracks) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    const label = genreLabel(track.genre);
    if (!label) continue;
    const key = genreKey(label);
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { key, label, count: 1 });
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'it-IT', { sensitivity: 'base' }));
}

// A regular playlist: capture today's matching tracks, preserving their order.
export function playlistTrackIds(
  tracks: readonly GenreTrack[],
  selectedGenres: readonly string[],
  initialTrackId?: string,
): string[] {
  const selected = new Set(selectedGenres.map(genreKey).filter(Boolean));
  const ids = new Set<string>();
  if (initialTrackId && tracks.some(track => track.id === initialTrackId)) ids.add(initialTrackId);
  const seen = new Set<string>();
  for (const track of tracks) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    if (selected.has(genreKey(track.genre))) ids.add(track.id);
  }
  return [...ids];
}
