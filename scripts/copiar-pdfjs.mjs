// Copia los recursos de PDF.js que se cargan aparte (mapas de caracteres, fuentes estándar,
// perfiles de color y módulos wasm) a public/pdfjs/, para que Vite los sirva y los publique.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origen = join(raiz, 'node_modules', 'pdfjs-dist');
const destino = join(raiz, 'public', 'pdfjs');

if (!existsSync(origen)) {
  console.error('Falta node_modules/pdfjs-dist: ejecuta «npm install».');
  process.exit(1);
}
mkdirSync(destino, { recursive: true });
for (const carpeta of ['cmaps', 'standard_fonts', 'iccs', 'wasm']) {
  cpSync(join(origen, carpeta), join(destino, carpeta), { recursive: true });
}
cpSync(join(origen, 'LICENSE'), join(destino, 'LICENSE'));
console.log('✓ Recursos de PDF.js copiados a public/pdfjs/');
