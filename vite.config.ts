import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwa } from './scripts/pwa.mjs';

// En GitHub Pages la app vive en /Lectura/ (el nombre del repositorio).
export default defineConfig({
  base: '/Lectura/',
  plugins: [react(), pwa()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1600 },
});
