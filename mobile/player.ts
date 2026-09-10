import { useEffect, useState, useSyncExternalStore } from 'react';
import { request, subscribe } from './bridge';
export type PlayerState = { currentId: string | null; playing: boolean; loading: boolean; position: number; duration: number; queue: string[]; shuffle: boolean; repeat: 0 | 1 | 2; volume: number; error: string };
let state: PlayerState = { currentId: null, playing: false, loading: false, position: 0, duration: 0, queue: [], shuffle: false, repeat: 0, volume: .7, error: '' };
const controlsListeners = new Set<() => void>();
const positionListeners = new Set<() => void>();
function update(next: PlayerState) { state = next; controlsListeners.forEach(fn => fn()); positionListeners.forEach(fn => fn()); }
subscribe<PlayerState>('player', update);
subscribe<{ position: number }>('progress', data => {
  state = { ...state, position: data.position };
  positionListeners.forEach(fn => fn());
});
export function usePlayer() {
  const [value, setValue] = useState(state);
  useEffect(() => {
    const updateControls = () => setValue(state);
    controlsListeners.add(updateControls);
    void request<PlayerState>('state').then(update).catch(() => {});
    return () => { controlsListeners.delete(updateControls); };
  }, []);
  return value;
}
export function usePosition() { return useSyncExternalStore(fn => { positionListeners.add(fn); return () => { positionListeners.delete(fn); }; }, () => state.position); }
export const command = (method: string, params: object = {}) => request<PlayerState>(method, params).then(update);
