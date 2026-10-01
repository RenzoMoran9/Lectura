// Voces propias con Supertonic 3 (Supertone Inc.; modelo con licencia OpenRAIL-M, versión int8 de
// sherpa-onnx). Los pasos siguen el ejemplo web oficial (licencia MIT): el texto pasa a números con
// un índice de letras, se calcula cuánto dura, se codifica, se «limpia» un ruido en unos pocos pasos
// y el vocoder lo convierte en sonido. Aquí solo hay cuentas: el Worker carga y llama.

import type * as Ort from 'onnxruntime-web';

export const PARTES = ['duration_predictor', 'text_encoder', 'vector_estimator', 'vocoder'] as const;
export type Parte = (typeof PARTES)[number];

export interface ConfigSupertonic {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { chunk_compress_factor: number; latent_dim: number };
}

export interface Voces {
  n: number;
  /** Estilo de cada voz: para el texto (ttl) y para la duración (dp). */
  ttl: Float32Array;
  dp: Float32Array;
  formaTtl: [number, number];
  formaDp: [number, number];
}

export interface ModeloSupertonic {
  ort: typeof Ort;
  cfg: ConfigSupertonic;
  indice: Int32Array;
  voces: Voces;
  sesiones: Record<Parte, Ort.InferenceSession>;
}

/** voice.bin de sherpa-onnx: dos formas (int64 × 3) y luego los estilos de todas las voces. */
export function leerVoces(datos: ArrayBuffer): Voces {
  const [n, t1, t2, , d1, d2] = Array.from(new BigInt64Array(datos, 0, 6), Number);
  const ttl = new Float32Array(datos, 48, n * t1 * t2);
  const dp = new Float32Array(datos, 48 + n * t1 * t2 * 4, n * d1 * d2);
  return { n, ttl, dp, formaTtl: [t1, t2], formaDp: [d1, d2] };
}

const CAMBIOS: [string, string][] = [
  ['–', '-'],
  ['‑', '-'],
  ['—', '-'],
  ['_', ' '],
  ['“', '"'],
  ['”', '"'],
  ['‘', "'"],
  ['’', "'"],
  ['´', "'"],
  ['`', "'"],
  ['[', ' '],
  [']', ' '],
  ['|', ' '],
  ['/', ' '],
  ['#', ' '],
];

/** El texto como lo espera el modelo: descompuesto (NFKD), limpio, con punto final y la etiqueta del idioma. */
export function prepararTexto(texto: string, idioma = 'es'): string {
  let t = texto.normalize('NFKD');
  for (const [a, b] of CAMBIOS) t = t.split(a).join(b);
  t = t.replace(/[♥☆♡©\\]/g, '');
  t = t.replace(/ ([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim();
  if (!/[.!?;:,'"')\]}…»]$/.test(t)) t += '.';
  return `<${idioma}>${t}</${idioma}>`;
}

/** Ruido gaussiano (Box-Muller) para empezar a limpiar. */
function ruido(n: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(1e-4, Math.random());
    x[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random());
  }
  return x;
}

/**
 * Dice un texto con una voz. `velocidad` 1 es la normal; `pasos` de limpieza: más pasos, más
 * calidad y más tiempo (3 a 5 está bien).
 */
export async function sintetizar(m: ModeloSupertonic, texto: string, voz: number, velocidad = 1, pasos = 4) {
  const { ort, cfg, indice, voces, sesiones: s } = m;
  const txt = prepararTexto(texto);
  const L = txt.length;
  const ids = new BigInt64Array(L);
  for (let j = 0; j < L; j++) {
    const c = txt.charCodeAt(j);
    ids[j] = BigInt(c < indice.length ? indice[c] : -1);
  }
  const textIds = new ort.Tensor('int64', ids, [1, L]);
  const textMask = new ort.Tensor('float32', new Float32Array(L).fill(1), [1, 1, L]);
  const [t1, t2] = voces.formaTtl;
  const [d1, d2] = voces.formaDp;
  const v = Math.max(0, Math.min(voces.n - 1, voz));
  const styleTtl = new ort.Tensor('float32', voces.ttl.slice(v * t1 * t2, (v + 1) * t1 * t2), [1, t1, t2]);
  const styleDp = new ort.Tensor('float32', voces.dp.slice(v * d1 * d2, (v + 1) * d1 * d2), [1, d1, d2]);

  const r1 = await s.duration_predictor.run({ text_ids: textIds, style_dp: styleDp, text_mask: textMask });
  // El ejemplo oficial usa 1,05 como velocidad normal.
  const duracion = (r1.duration.data as Float32Array)[0] / (1.05 * velocidad);
  const r2 = await s.text_encoder.run({ text_ids: textIds, style_ttl: styleTtl, text_mask: textMask });

  const sr = cfg.ae.sample_rate;
  const muestras = Math.floor(duracion * sr);
  const trozo = cfg.ae.base_chunk_size * cfg.ttl.chunk_compress_factor;
  const largo = Math.max(1, Math.floor((muestras + trozo - 1) / trozo));
  const dim = cfg.ttl.latent_dim * cfg.ttl.chunk_compress_factor;
  let xt = ruido(dim * largo);
  const latentMask = new ort.Tensor('float32', new Float32Array(largo).fill(1), [1, 1, largo]);
  const total = new ort.Tensor('float32', new Float32Array([pasos]), [1]);
  for (let p = 0; p < pasos; p++) {
    const r = await s.vector_estimator.run({
      noisy_latent: new ort.Tensor('float32', xt, [1, dim, largo]),
      text_emb: r2.text_emb,
      style_ttl: styleTtl,
      latent_mask: latentMask,
      text_mask: textMask,
      current_step: new ort.Tensor('float32', new Float32Array([p]), [1]),
      total_step: total,
    });
    xt = r.denoised_latent.data as Float32Array;
  }
  const r4 = await s.vocoder.run({ latent: new ort.Tensor('float32', xt, [1, dim, largo]) });
  const onda = r4.wav_tts.data as Float32Array;
  const pcm = onda.slice(0, Math.min(onda.length, muestras));
  return { pcm, sr, segundos: pcm.length / sr };
}
