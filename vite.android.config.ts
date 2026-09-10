import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  root: path('./mobile'),
  base: './',
  publicDir: false,
  plugins: [react()],
  resolve: { alias: [
    { find: '@/lib/music', replacement: path('./mobile/music.ts') },
    { find: '@/components/device-setup', replacement: path('./mobile/device-setup.tsx') },
    { find: '@/components/playback-progress', replacement: path('./mobile/playback-progress.tsx') },
    { find: '@', replacement: path('./') },
  ] },
  build: { outDir: path('./android/app/src/main/assets/ui'), emptyOutDir: true, target: 'es2020', sourcemap: false },
});
