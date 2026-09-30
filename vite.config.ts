import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En GitHub Pages la app vive en /Lectura/ (el nombre del repositorio).
export default defineConfig({
  base: '/Lectura/',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1600 },
});
