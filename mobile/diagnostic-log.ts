const errors: string[] = [];
export function recordUiError(operation: string, error: unknown) {
  // Keep error categories only, avoiding filenames, titles and arbitrary payloads.
  const category = error instanceof Error ? error.name : 'Errore';
  errors.push(`${new Date().toISOString()} · ${operation} · ${category}`);
  if (errors.length > 20) errors.shift();
}
export const uiErrorReport = () => errors.join('\n');
