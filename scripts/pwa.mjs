// Plugin de Vite: al compilar, arma el service worker (sw.js) con la lista de todos los archivos de
// la app, para que funcione sin internet. La versión cambia cuando cambia cualquier archivo.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function archivosDe(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivosDe(ruta) : [ruta];
  });
}

// Lo que no hace falta para leer sin internet: el libro de muestra (se guarda si se usa) y las licencias.
const FUERA = [/^muestra\//, /\.md$/i, /\.map$/, /^sw\.js$/];

export function pwa() {
  let publico = '';
  return {
    name: 'entre-hojas-pwa',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publico = config.publicDir;
    },
    generateBundle(_, paquete) {
      const publicos = publico ? archivosDe(publico).map((f) => relative(publico, f).split(sep).join('/')) : [];
      const todos = [...new Set(['index.html', ...Object.keys(paquete), ...publicos])].filter((f) => !FUERA.some((r) => r.test(f))).sort();
      const huella = createHash('sha256');
      for (const f of todos) {
        huella.update(f);
        const salida = paquete[f];
        if (salida) huella.update(salida.type === 'chunk' ? salida.code : salida.source);
        else if (publicos.includes(f)) huella.update(readFileSync(join(publico, f)));
      }
      const plantilla = readFileSync(new URL('../src/pwa/sw.plantilla.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: plantilla.replace('__VERSION__', huella.digest('hex').slice(0, 12)).replace('__ARCHIVOS__', JSON.stringify(todos, null, 1)),
      });
    },
  };
}
