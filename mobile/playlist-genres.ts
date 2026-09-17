import { genreKey, splitGenres } from '../lib/genres.js';

type GenreTrack = {
  id: string;
  genre?: string | null;
};

export type PlaylistGenre = {
  key: string;
  label: string;
  count: number;
};

export function playlistGenres(
  tracks: readonly GenreTrack[],
): PlaylistGenre[] {
  const groups = new Map<string, PlaylistGenre>();
  const seen = new Set<string>();

  for (const track of tracks) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);

    for (const label of splitGenres(track.genre)) {
      const key = genreKey(label);
      const group = groups.get(key);

      if (group) {
        group.count++;
      } else {
        groups.set(key, { key, label, count: 1 });
      }
    }
  }

  return [...groups.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label, 'it-IT', {
        sensitivity: 'base',
      }),
  );
}

export function playlistTrackIds(
  tracks: readonly GenreTrack[],
  selectedGenres: readonly string[],
  initialTrackId?: string,
): string[] {
  const selected = new Set(
    selectedGenres.flatMap(splitGenres).map(genreKey),
  );

  const ids = new Set<string>();

  if (initialTrackId && tracks.some(track => track.id === initialTrackId)) {
    ids.add(initialTrackId);
  }

  const seen = new Set<string>();

  for (const track of tracks) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);

    const matches = splitGenres(track.genre).some(genre =>
      selected.has(genreKey(genre)),
    );

    if (matches) ids.add(track.id);
  }

  return [...ids];
}