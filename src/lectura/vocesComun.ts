// Lo que comparten el Worker de las voces propias y la app: los mensajes y el nombre de la caché.

export type PedidoVoces =
  | { tipo: 'cargar'; base: string; ort: string }
  | { tipo: 'decir'; id: number; texto: string; voz: number; velocidad: number; pasos: number };

export type RespuestaVoces =
  | { tipo: 'progreso'; hecho: number; total: number; bajando: boolean }
  | { tipo: 'listo'; hilos: number }
  | { tipo: 'audio'; id: number; pcm: Float32Array; sr: number; ms: number }
  | { tipo: 'error'; id?: number; mensaje: string };

/** Donde quedan guardados los modelos (se cambia el número si cambian los modelos). */
export const CACHE_VOCES = 'entre-hojas-voces-1';
