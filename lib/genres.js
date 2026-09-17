/** @param {string | null | undefined} value */
export function genreKey(value) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('it-IT');
}

/** @param {string | null | undefined} value */
export function splitGenres(value) {
  /** @type {Map<string, string>} */
  const genres = new Map();

  for (const part of (value ?? '').normalize('NFKC').split(/[;\u0000\r\n]+/)) {
    const label = part.replace(/\s+/g, ' ').trim();
    const key = genreKey(label);

    if (key && !genres.has(key)) {
      genres.set(key, label);
    }
  }

  return [...genres.values()];
}