// Las voces propias de Entre Hojas (dos de mujer y dos de hombre, español latino), que funcionan en
// el teléfono sin internet una vez bajadas. El Worker las genera; aquí se piden, se guardan las
// próximas oraciones ya listas y se reproducen con Web Audio.

import { paraLeer } from './numeros';
import type { Locutor, OpcionesDecir } from './voz';
import { CACHE_VOCES, type PedidoVoces, type RespuestaVoces } from './vocesComun';

export interface VozPropia {
  id: string;
  nombre: string;
  genero: 'mujer' | 'hombre';
  /** Número de la voz dentro del modelo (F1 = 0 … M5 = 9). */
  sid: number;
}

// Elegidas por lo bien que se entienden (con Whisper, sin errores en un párrafo de prueba).
export const VOCES_PROPIAS: VozPropia[] = [
  { id: 'eh:lucia', nombre: 'Lucía', genero: 'mujer', sid: 0 },
  { id: 'eh:elena', nombre: 'Elena', genero: 'mujer', sid: 2 },
  { id: 'eh:mateo', nombre: 'Mateo', genero: 'hombre', sid: 8 },
  { id: 'eh:andres', nombre: 'Andrés', genero: 'hombre', sid: 9 },
];

export const vozPropia = (id: string | undefined) => VOCES_PROPIAS.find((v) => v.id === id);

export type FaseVoces = 'sin-bajar' | 'bajando' | 'preparando' | 'lista' | 'error';
export interface EstadoVoces {
  fase: FaseVoces;
  /** 0..1 mientras se bajan o se cargan. */
  avance: number;
  /** Tamaño total en MB (para avisar antes de bajarlas). */
  mb: number;
  mensaje?: string;
}

const BASE = `${import.meta.env.BASE_URL}voces/supertonic/`;
const ORT = `${import.meta.env.BASE_URL}ort/`;
const absoluta = (ruta: string) => new URL(ruta, location.href).href;

type Audio = { pcm: Float32Array; sr: number };

class MotorVoces {
  estado: EstadoVoces = { fase: 'sin-bajar', avance: 0, mb: 145 };
  private worker: Worker | null = null;
  private oyentes = new Set<(e: EstadoVoces) => void>();
  private pedidos = new Map<number, { ok: (a: Audio) => void; mal: (e: Error) => void }>();
  private siguiente = 1;
  /** Oraciones ya pedidas o listas (clave: voz, velocidad y texto). */
  private hechas = new Map<string, Promise<Audio>>();
  /** Pasos de limpieza: se ajustan solos según lo rápido que va el teléfono. */
  private pasos = 4;
  private hilos = 1;
  private listo: Promise<void> | null = null;
  private avisarListo: (() => void) | null = null;
  private fallarListo: ((e: Error) => void) | null = null;

  oir(f: (e: EstadoVoces) => void) {
    this.oyentes.add(f);
    return () => void this.oyentes.delete(f);
  }

  private poner(cambios: Partial<EstadoVoces>) {
    this.estado = { ...this.estado, ...cambios };
    this.oyentes.forEach((f) => f(this.estado));
  }

  /** ¿Ya se bajaron alguna vez? (están en la caché del teléfono). */
  async bajadas(): Promise<boolean> {
    try {
      const c = await caches.open(CACHE_VOCES);
      return !!(await c.match(absoluta(`${BASE}vector_estimator.int8.onnx`)));
    } catch {
      return false;
    }
  }

  /** El tamaño de la descarga, para decirlo antes de bajarla. */
  async revisar() {
    if (this.estado.fase !== 'sin-bajar') return;
    try {
      const m = (await (await fetch(`${BASE}manifiesto.json`)).json()) as { total: number };
      this.poner({ mb: Math.round(m.total / 1e6) });
    } catch {
      /* sin internet: se queda el tamaño aproximado */
    }
  }

  /** Baja (la primera vez) y carga las voces. Se puede llamar muchas veces. */
  cargar(): Promise<void> {
    if (this.listo) return this.listo;
    this.listo = new Promise<void>((ok, mal) => {
      this.avisarListo = ok;
      this.fallarListo = mal;
    });
    this.listo.catch(() => {});
    void this.bajadas().then((ya) => this.poner({ fase: ya ? 'preparando' : 'bajando', avance: 0, mensaje: undefined }));
    const w = this.trabajador();
    w.postMessage({ tipo: 'cargar', base: absoluta(BASE), ort: absoluta(ORT) } satisfies PedidoVoces);
    return this.listo;
  }

  private trabajador(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./voces.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<RespuestaVoces>) => {
      const r = e.data;
      if (r.tipo === 'progreso') {
        this.poner({ fase: r.bajando ? 'bajando' : 'preparando', avance: r.total ? r.hecho / r.total : 0, mb: Math.round(r.total / 1e6) });
      } else if (r.tipo === 'listo') {
        this.hilos = r.hilos;
        this.pasos = r.hilos > 1 ? 4 : 3;
        this.poner({ fase: 'lista', avance: 1 });
        this.avisarListo?.();
      } else if (r.tipo === 'audio') {
        const p = this.pedidos.get(r.id);
        this.pedidos.delete(r.id);
        // Si va lento, menos pasos; si sobra tiempo, más calidad.
        const ritmo = r.pcm.length / r.sr / (r.ms / 1000);
        if (ritmo < 1.3 && this.pasos > 2) this.pasos--;
        else if (ritmo > 3.5 && this.pasos < 5) this.pasos++;
        p?.ok({ pcm: r.pcm, sr: r.sr });
      } else if (r.tipo === 'error') {
        if (r.id != null) {
          this.pedidos.get(r.id)?.mal(new Error(r.mensaje));
          this.pedidos.delete(r.id);
        } else {
          this.poner({ fase: 'error', mensaje: r.mensaje });
          this.fallarListo?.(new Error(r.mensaje));
          this.listo = null;
        }
      }
    };
    w.onerror = (e) => {
      this.poner({ fase: 'error', mensaje: e.message || 'No se pudieron cargar las voces' });
      this.fallarListo?.(new Error(e.message));
      this.listo = null;
      this.worker = null;
    };
    this.worker = w;
    return w;
  }

  /** El audio de una oración (lo pide si aún no está). */
  audio(texto: string, voz: number, velocidad: number): Promise<Audio> {
    const clave = `${voz}|${velocidad}|${texto}`;
    let a = this.hechas.get(clave);
    if (!a) {
      a = this.cargar().then(
        () =>
          new Promise<Audio>((ok, mal) => {
            const id = this.siguiente++;
            this.pedidos.set(id, { ok, mal });
            this.trabajador().postMessage({ tipo: 'decir', id, texto: paraLeer(texto), voz, velocidad, pasos: this.pasos } satisfies PedidoVoces);
          }),
      );
      a.catch(() => this.hechas.delete(clave));
      this.hechas.set(clave, a);
      // Solo unas pocas oraciones guardadas.
      while (this.hechas.size > 6) this.hechas.delete(this.hechas.keys().next().value!);
    }
    return a;
  }

  get hilosEnUso() {
    return this.hilos;
  }
}

export const motorVoces = new MotorVoces();

let ctx: AudioContext | null = null;

/** Una voz propia como «locutor» de la lectura en voz alta. */
export class LocutorPropio implements Locutor {
  private turno = 0;
  private fuente: AudioBufferSourceNode | null = null;

  constructor(public voz: VozPropia) {}

  despertar() {
    if (!ctx) {
      const Clase = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Clase();
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    void motorVoces.cargar().catch(() => {});
  }

  decir(texto: string, o: OpcionesDecir) {
    this.parar();
    const turno = ++this.turno;
    motorVoces.audio(texto, this.voz.sid, o.velocidad).then(
      ({ pcm, sr }) => {
        if (turno !== this.turno || !ctx) return;
        const buf = ctx.createBuffer(1, pcm.length, sr);
        buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
        const f = ctx.createBufferSource();
        f.buffer = buf;
        f.connect(ctx.destination);
        f.onended = () => {
          if (turno !== this.turno || this.fuente !== f) return;
          this.fuente = null;
          o.alTerminar();
        };
        this.fuente = f;
        f.start();
      },
      (e: Error) => turno === this.turno && o.alFallar(e.message || 'voz-propia'),
    );
  }

  /** Deja lista la próxima oración mientras suena esta. */
  preparar(texto: string, velocidad: number) {
    void motorVoces.audio(texto, this.voz.sid, velocidad).catch(() => {});
  }

  callar() {
    this.turno++;
    this.parar();
  }

  private parar() {
    const f = this.fuente;
    this.fuente = null;
    if (f) {
      f.onended = null;
      try {
        f.stop();
      } catch {
        /* ya había terminado */
      }
    }
  }
}
