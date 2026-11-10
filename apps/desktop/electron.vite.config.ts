// Hanya proses main yang dibundel. Tidak ada renderer lokal (dashboard dimuat dari port
// admin sensor) dan tidak ada preload: permukaan serangan sekecil mungkin.
// envDir = folder ini, jadi .env di root repo (berisi secret) tidak pernah ikut dibundel.
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    envDir: import.meta.dirname,
    build: {
      outDir: 'out/main',
      sourcemap: false,
    },
  },
});
