import type { Track } from './music';

export const FEATURES = {
  preferito: { label: 'È un preferito', description: '1 se hai messo un cuore, altrimenti 0.' },
  artista: { label: 'Affinità con l’artista', description: 'Da 0 a 1, dagli ascolti e cuori sugli altri brani dello stesso artista.' },
  genere: { label: 'Affinità con il genere', description: 'Da 0 a 1, dagli ascolti e cuori sugli altri brani dello stesso genere.' },
  nuovo: { label: 'Mai ascoltato', description: '1 se non ci sono ascolti significativi, altrimenti 0.' },
  recente: { label: 'Ascoltato di recente', description: 'Da 0 a 1: vale 1 subito dopo un ascolto e si dimezza dopo un giorno. Usa un peso negativo per ridurre le ripetizioni.' },
  ascolti: { label: 'Numero di ascolti', description: 'Quante volte hai ascoltato almeno 30 secondi o metà del brano.' },
  salti: { label: 'Numero di salti', description: 'Quante volte hai cambiato brano prima della soglia di ascolto.' },
  giorni: { label: 'Giorni dall’ultimo ascolto', description: 'Da 0 a 365. Vale 365 per un brano mai ascoltato.' },
  durata: { label: 'Durata in secondi', description: 'La durata del brano; 0 se il dato non è disponibile.' },
  casuale: { label: 'Varietà nella selezione', description: 'Un numero casuale da 0 a 1, nuovo a ogni mix. Aumenta il peso per rendere la selezione meno prevedibile.' },
} as const;
export type Feature = keyof typeof FEATURES;
export type Variables = Record<Feature, number>;
export type Rule = { id: string; feature: Feature; weight: number };
export type Algorithm = { name: string; method: 'rules' | 'formula'; rules: Rule[]; formula: string };
export type ListeningSettings = { mode: 'random' | 'custom'; algorithm: Algorithm };
export type Selection = { track: Track; score: number | null; reason: string; values?: Variables };
export const DEFAULT_SETTINGS: ListeningSettings = {
  mode: 'custom',
  algorithm: {
    name: 'Il mio mix', method: 'rules',
    rules: [
      { id: 'favorite', feature: 'preferito', weight: 5 },
      { id: 'artist', feature: 'artista', weight: 4 },
      { id: 'genre', feature: 'genere', weight: 2 },
      { id: 'unheard', feature: 'nuovo', weight: 3 },
      { id: 'skip', feature: 'salti', weight: -2 },
      { id: 'recent', feature: 'recente', weight: -6 },
      { id: 'variety', feature: 'casuale', weight: 2 },
    ],
    formula: 'preferito * 5 + artista * 4 + genere * 2 + nuovo * 3 - min(salti, 8) * 2 - recente * 6 + casuale * 2',
  },
};

export function randomSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** Fisher–Yates: same probability for every remaining item; no history or metadata is read. */
export function shuffled<T>(values: readonly T[], rng = Math.random): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

/** Fix the playback order once, keeping a manually selected/current track first. */
export function playbackOrder(ids: readonly string[], random: boolean, firstId: string | null = null, rng = Math.random): string[] {
  const unique = [...new Set(ids)];
  if (!random) return unique;
  if (firstId && unique.includes(firstId)) return [firstId, ...shuffled(unique.filter(id => id !== firstId), rng)];
  return shuffled(unique, rng);
}

/** Traverse the existing permutation. A fresh shuffle starts only after a full cycle. */
export function nextQueuedTrack(ids: readonly string[], currentId: string | null, repeatAll: boolean, random: boolean, rng = Math.random): { order: string[]; id: string | null } {
  const order = [...new Set(ids)];
  if (!order.length) return { order, id: null };
  const nextIndex = order.indexOf(currentId || '') + 1;
  if (nextIndex < order.length) return { order, id: order[nextIndex] };
  if (!repeatAll) return { order, id: null };
  const nextOrder = random ? shuffled(order, rng) : order;
  if (random && nextOrder.length > 1 && nextOrder[0] === currentId) {
    const other = 1 + Math.floor(rng() * (nextOrder.length - 1));
    [nextOrder[0], nextOrder[other]] = [nextOrder[other], nextOrder[0]];
  }
  return { order: nextOrder, id: nextOrder[0] };
}

// A bounded arithmetic parser. It never calls eval/Function or executes user code.
type Expression = (values: Variables) => number;
const MATH: Record<string, { min: number; max: number; run: (...n: number[]) => number }> = {
  min: { min: 2, max: 10, run: Math.min }, max: { min: 2, max: 10, run: Math.max },
  abs: { min: 1, max: 1, run: Math.abs }, sqrt: { min: 1, max: 1, run: Math.sqrt },
  log: { min: 1, max: 1, run: Math.log }, floor: { min: 1, max: 1, run: Math.floor },
};
export function compileFormula(source: string): Expression {
  if (!source.trim()) throw new Error('Scrivi una formula oppure usa le regole.');
  if (source.length > 600) throw new Error('La formula può contenere al massimo 600 caratteri.');
  const tokens: string[] = []; const pattern = /\s*(\d+(?:\.\d+)?|\.\d+|[a-z_][a-z_0-9]*|[()+\-*/^,])/iy;
  let offset = 0;
  while (offset < source.length) {
    if (!source.slice(offset).trim()) break;
    pattern.lastIndex = offset; const match = pattern.exec(source);
    if (!match) throw new Error(`Carattere non consentito in posizione ${offset + 1}.`);
    tokens.push(match[1].toLowerCase()); offset = pattern.lastIndex;
  }
  if (tokens.length > 220) throw new Error('La formula è troppo complessa.');
  let cursor = 0, depth = 0;
  function expression(minPrecedence = 0): Expression {
    if (++depth > 30) throw new Error('Troppe parentesi annidate.');
    const token = tokens[cursor++]; let left: Expression;
    if (token === '-' || token === '+') { const child = expression(3); left = v => token === '-' ? -child(v) : child(v); }
    else if (token === '(') { left = expression(); if (tokens[cursor++] !== ')') throw new Error('Manca una parentesi chiusa.'); }
    else if (token && /^\d|^\.\d/.test(token)) { const value = Number(token); left = () => value; }
    else if (token && Object.hasOwn(FEATURES, token)) { left = v => v[token as Feature]; }
    else if (token && Object.hasOwn(MATH, token)) {
      if (tokens[cursor++] !== '(') throw new Error(`Scrivi ${token}(…).`);
      const args: Expression[] = [];
      if (tokens[cursor] !== ')') { do { args.push(expression()); if (tokens[cursor] !== ',') break; cursor++; } while (cursor < tokens.length); }
      if (tokens[cursor++] !== ')') throw new Error('Controlla le parentesi della funzione.');
      const fn = MATH[token]; if (args.length < fn.min || args.length > fn.max) throw new Error(`${token} richiede ${fn.min === fn.max ? fn.min : `da ${fn.min} a ${fn.max}`} argomenti.`);
      left = v => fn.run(...args.map(a => a(v)));
    } else throw new Error(token ? `“${token}” non è una variabile o funzione disponibile.` : 'La formula è incompleta.');
    const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
    while (cursor < tokens.length && (precedence[tokens[cursor]] ?? -1) >= minPrecedence) {
      const op = tokens[cursor++], p = precedence[op], previous = left, right = expression(op === '^' ? p : p + 1);
      left = v => { const a = previous(v), b = right(v); return op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? a / b : a ** b; };
    }
    depth--; return left;
  }
  const evaluate = expression();
  if (cursor !== tokens.length) throw new Error(`Controlla la formula vicino a “${tokens[cursor]}”.`);
  return values => { const result = evaluate(values); if (!Number.isFinite(result)) throw new Error('La formula produce un valore non valido. Controlla divisioni per zero, radici e logaritmi.'); return result; };
}
export function validateAlgorithm(a: Algorithm) {
  if (!a || !['rules', 'formula'].includes(a.method) || typeof a.name !== 'string' || typeof a.formula !== 'string' || !Array.isArray(a.rules)) throw new Error('Algoritmo non valido.');
  if (!a.name.trim()) throw new Error('Dai un nome al tuo algoritmo.');
  if (a.method === 'formula') compileFormula(a.formula);
  else {
    if (!a.rules.length) throw new Error('Aggiungi almeno una regola.');
    if (a.rules.length > 20) throw new Error('Puoi usare al massimo 20 regole.');
    if (a.rules.some(r => !Object.hasOwn(FEATURES, r.feature) || !Number.isFinite(r.weight) || Math.abs(r.weight) > 10)) throw new Error('Ogni peso deve essere tra −10 e +10.');
  }
}
export const formulaFromRules = (rules: Rule[]) => rules.length ? rules.map(r => `(${r.feature} * ${r.weight})`).join(' + ') : '0';
const key = (value: string) => value.trim().toLocaleLowerCase('it');
const feedback = (t: Track) => (t.liked ? 4 : 0) + Math.min(t.plays, 10) - Math.min(t.skips, 5);
function contextFor(tracks: Track[]) {
  const artists = new Map<string, number>(), genres = new Map<string, number>();
  for (const t of tracks) {
    if (t.artist !== 'Artista sconosciuto' && t.artist.trim()) artists.set(key(t.artist), (artists.get(key(t.artist)) || 0) + feedback(t));
    if (t.genre.trim()) genres.set(key(t.genre), (genres.get(key(t.genre)) || 0) + feedback(t));
  }
  return { artists, genres };
}
function variables(t: Track, context: ReturnType<typeof contextFor>, rng: () => number, now: number): Variables {
  const affinity = (map: Map<string, number>, name: string) => Math.max(0, Math.min(1, ((map.get(key(name)) || 0) - feedback(t)) / 10));
  return {
    preferito: t.liked ? 1 : 0, artista: t.artist !== 'Artista sconosciuto' && t.artist.trim() ? affinity(context.artists, t.artist) : 0,
    genere: t.genre.trim() ? affinity(context.genres, t.genre) : 0, nuovo: t.plays === 0 ? 1 : 0,
    recente: t.lastPlayed ? 1 / (1 + Math.max(0, now - t.lastPlayed) / 86400000) : 0,
    ascolti: t.plays, salti: t.skips, giorni: t.lastPlayed ? Math.min(365, Math.max(0, (now - t.lastPlayed) / 86400000)) : 365,
    durata: t.duration, casuale: rng(),
  };
}
export function selectTracks(tracks: Track[], settings: ListeningSettings, seed = 1, now = Date.now()): Selection[] {
  const rng = seededRandom(seed), ordered = [...tracks].sort((a, b) => a.id.localeCompare(b.id));
  if (settings.mode === 'random') return shuffled(ordered, rng).map(track => ({ track, score: null, reason: 'Scelta casuale · stessa probabilità per tutti' }));
  const a = settings.algorithm; validateAlgorithm(a);
  const compiled = a.method === 'formula' ? compileFormula(a.formula) : null;
  const context = contextFor(tracks);
  // Shuffle before stable scoring, so tied scores have no artist/title ordering bias.
  return shuffled(ordered, rng).map(track => {
    const values = variables(track, context, rng, now);
    const contributions = a.rules.map(rule => ({ rule, value: values[rule.feature] * rule.weight }));
    const score = compiled ? compiled(values) : contributions.reduce((s, c) => s + c.value, 0);
    if (!Number.isFinite(score)) throw new Error('Il punteggio non è un numero valido.');
    const best = [...contributions].sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0];
    const reason = compiled ? `Formula: ${Number(score.toFixed(2))} punti` : best && best.value !== 0 ? `${FEATURES[best.rule.feature].label}: ${best.value > 0 ? '+' : ''}${Number(best.value.toFixed(2))} punti` : 'Nessuna regola favorisce questo brano';
    return { track, score, reason, values };
  }).sort((a, b) => b.score - a.score);
}
