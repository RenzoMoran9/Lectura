// Worker de las voces propias: baja los modelos una sola vez (quedan guardados para usarlos sin
// internet), los carga con ONNX Runtime y convierte oraciones en sonido sin trabar la pantalla.

import * as ort from 'onnxruntime-web/wasm';
import { leerVoces, PARTES, sintetizar, type ConfigSupertonic, type ModeloSupertonic, type Parte } from './supertonic';

import { CACHE_VOCES, type PedidoVoces, type RespuestaVoces } from './vocesComun';

const enviar = (r: RespuestaVoces, transferir: Transferable[] = []) => (self as unknown as Worker).postMessage(r, transferir);

/** Un archivo del modelo: de lo guardado o de internet (y se guarda), contando los bytes. */
async function traer(url: string, cache: Cache | null, alAvanzar: (n: number, bajando: boolean) => void): Promise<ArrayBuffer> {
  const guardado = await cache?.match(url);
  if (guardado) {
    const b = await guardado.arrayBuffer();
    alAvanzar(b.byteLength, false);
    return b;
  }
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok || !r.body) throw new Error(`No se pudo bajar ${url.split('/').pop()} (${r.status})`);
  if (cache) {
    // Una copia va directo a la caché; la otra solo se cuenta para mostrar el avance.
    const [a, b] = r.body.tee();
    const guardar = cache.put(url, new Response(a, { headers: { 'Content-Type': 'application/octet-stream' } }));
    const lector = b.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      alAvanzar(value.byteLength, true);
    }
    await guardar;
    const g = await cache.match(url);
    if (g) return await g.arrayBuffer();
  }
  // Sin caché (modo privado): se junta en memoria.
  const partes: Uint8Array[] = [];
  let n = 0;
  const lector = (cache ? (await fetch(url)).body! : r.body).getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value);
    n += value.byteLength;
    if (!cache) alAvanzar(value.byteLength, true);
  }
  const todo = new Uint8Array(n);
  let o = 0;
  for (const p of partes) {
    todo.set(p, o);
    o += p.byteLength;
  }
  return todo.buffer;
}

let modelo: Promise<ModeloSupertonic> | null = null;

async function cargar(base: string, ortBase: string): Promise<ModeloSupertonic> {
  const hilos = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  ort.env.wasm.numThreads = hilos;
  ort.env.wasm.wasmPaths = { mjs: `${ortBase}ort-wasm-simd-threaded.mjs`, wasm: `${ortBase}ort-wasm-simd-threaded.wasm` };
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_VOCES);
  } catch {
    cache = null;
  }
  const manifiesto = (await (await fetch(`${base}manifiesto.json`, { cache: 'no-cache' }).catch(() => cache?.match(`${base}manifiesto.json`)))?.json()) as {
    archivos: Record<string, number>;
    total: number;
  };
  if (cache) void cache.put(`${base}manifiesto.json`, new Response(JSON.stringify(manifiesto))).catch(() => {});
  let hecho = 0;
  let ultimo = 0;
  const avanzar = (n: number, bajando: boolean) => {
    hecho += n;
    const ahora = performance.now();
    if (ahora - ultimo > 150 || hecho >= manifiesto.total) {
      ultimo = ahora;
      enviar({ tipo: 'progreso', hecho: Math.min(hecho, manifiesto.total), total: manifiesto.total, bajando });
    }
  };
  const [cfgDatos, indice, voces] = await Promise.all([
    traer(`${base}tts.json`, cache, avanzar),
    traer(`${base}unicode_indexer.bin`, cache, avanzar),
    traer(`${base}voice.bin`, cache, avanzar),
  ]);
  const cfg = JSON.parse(new TextDecoder().decode(cfgDatos)) as ConfigSupertonic;
  const sesiones = {} as Record<Parte, ort.InferenceSession>;
  for (const p of PARTES) {
    const datos = await traer(`${base}${p}.int8.onnx`, cache, avanzar);
    sesiones[p] = await ort.InferenceSession.create(new Uint8Array(datos), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  }
  enviar({ tipo: 'listo', hilos });
  return { ort, cfg, indice: new Int32Array(indice), voces: leerVoces(voces), sesiones };
}

// Las oraciones se dicen de a una (el modelo no atiende dos a la vez).
let fila: Promise<unknown> = Promise.resolve();

self.onmessage = (e: MessageEvent<PedidoVoces>) => {
  const p = e.data;
  if (p.tipo === 'cargar') {
    modelo ??= cargar(p.base, p.ort);
    modelo.catch((err: unknown) => {
      modelo = null;
      enviar({ tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) });
    });
    return;
  }
  if (p.tipo === 'decir') {
    fila = fila.then(async () => {
      try {
        if (!modelo) throw new Error('Las voces no están cargadas');
        const m = await modelo;
        const t0 = performance.now();
        const { pcm, sr } = await sintetizar(m, p.texto, p.voz, p.velocidad, p.pasos);
        enviar({ tipo: 'audio', id: p.id, pcm, sr, ms: performance.now() - t0 }, [pcm.buffer]);
      } catch (err) {
        enviar({ tipo: 'error', id: p.id, mensaje: err instanceof Error ? err.message : String(err) });
      }
    });
  }
};
