// Baja las voces propias de la lectura en voz alta a public/voces/supertonic/ (si faltan):
// Supertonic 3 (Supertone Inc., modelo OpenRAIL-M) en la versión int8 que publica sherpa-onnx.
// No se guardan en el repositorio: GitHub Actions las baja al publicar. Se verifica la huella.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAQUETE = 'sherpa-onnx-supertonic-3-tts-int8-2026-05-11';
const URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${PAQUETE}.tar.bz2`;
const HUELLA = '82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427';
const ARCHIVOS = ['duration_predictor.int8.onnx', 'text_encoder.int8.onnx', 'vector_estimator.int8.onnx', 'vocoder.int8.onnx', 'tts.json', 'unicode_indexer.bin', 'voice.bin'];

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'public', 'voces', 'supertonic');
mkdirSync(destino, { recursive: true });

if (!ARCHIVOS.every((f) => existsSync(join(destino, f)))) {
  const tmp = mkdtempSync(join(tmpdir(), 'voces-'));
  const tar = join(tmp, 'voces.tar.bz2');
  console.log(`Bajando ${PAQUETE}…`);
  execFileSync('curl', ['-sSL', '--retry', '3', '-o', tar, URL], { stdio: 'inherit' });
  const h = createHash('sha256').update(readFileSync(tar)).digest('hex');
  if (h !== HUELLA) {
    console.error(`La huella no coincide (${h}): no se usan estos archivos.`);
    process.exit(1);
  }
  execFileSync('tar', ['xjf', tar, '-C', tmp]);
  for (const f of [...ARCHIVOS, 'LICENSE']) copyFileSync(join(tmp, PAQUETE, f), join(destino, f));
  rmSync(tmp, { recursive: true, force: true });
}

const archivos = Object.fromEntries(ARCHIVOS.map((f) => [f, statSync(join(destino, f)).size]));
const total = Object.values(archivos).reduce((a, b) => a + b, 0);
writeFileSync(join(destino, 'manifiesto.json'), JSON.stringify({ paquete: PAQUETE, archivos, total }, null, 1) + '\n');
console.log(`✓ Voces en public/voces/supertonic/ (${Math.round(total / 1e6)} MB)`);
