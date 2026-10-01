import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwa } from './scripts/pwa.mjs';

// Con el origen aislado, las voces propias usan varios núcleos del procesador. En GitHub Pages
// estas cabeceras las pone el service worker; aquí, el servidor de desarrollo.
const aislado = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' };

// En GitHub Pages la app vive en /Lectura/ (el nombre del repositorio).
export default defineConfig({
  base: '/Lectura/',
  plugins: [react(), pwa()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: { headers: aislado },
  preview: { headers: aislado },
});
