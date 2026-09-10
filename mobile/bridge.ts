declare global {
  interface Window { OndaAndroid?: { postMessage(message: string): void }; __ondaReply?: (message: Reply) => void; }
}
type Reply = { id?: number; result?: unknown; error?: string; event?: string; data?: unknown };
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const events = new Map<string, Set<(data: any) => void>>();
let sequence = 0;
window.__ondaReply = message => {
  if (message.event) { events.get(message.event)?.forEach(fn => fn(message.data)); return; }
  const call = pending.get(message.id!);
  if (!call) return;
  clearTimeout(call.timer); pending.delete(message.id!);
  if (message.error) call.reject(new Error(message.error)); else call.resolve(message.result);
};
export function request<T = void>(method: string, params: object = {}, timeout = 30_000): Promise<T> {
  if (!window.OndaAndroid) return Promise.reject(new Error('Apri Onda dall’app Android installata.'));
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Operazione non completata. Riapri l’app per verificare lo stato.')); }, timeout);
    pending.set(id, { resolve, reject, timer });
    try { window.OndaAndroid!.postMessage(JSON.stringify({ id, method, params })); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}
export function subscribe<T>(event: string, callback: (data: T) => void) {
  const listeners = events.get(event) ?? new Set(); events.set(event, listeners); listeners.add(callback);
  return () => { listeners.delete(callback); };
}
