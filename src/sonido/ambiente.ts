// Sonido de fondo mientras se lee: para relajarse (playa, bosque y fogata, lluvia) o según el
// género del libro (terror, suspenso, drama, acción). Cada uno tiene dos grabaciones de 30 s que
// se unen con fundidos en un solo bucle de un minuto, así no se nota la costura ni se repite tan
// seguido. Todas se igualan de volumen y pasan por un compresor suave.

import { sonido } from './sonido';

export const AMBIENTES = [
  { id: 'playa', nombre: 'Playa', grupo: 'relajarse', icono: 'waves' },
  { id: 'bosque', nombre: 'Bosque y fogata', grupo: 'relajarse', icono: 'flame-kindling' },
  { id: 'lluvia', nombre: 'Lluvia', grupo: 'relajarse', icono: 'cloud-rain' },
  { id: 'terror', nombre: 'Terror', grupo: 'genero', icono: 'ghost' },
  { id: 'suspenso', nombre: 'Suspenso', grupo: 'genero', icono: 'hourglass' },
  { id: 'drama', nombre: 'Drama', grupo: 'genero', icono: 'drama' },
  { id: 'accion', nombre: 'Acción', grupo: 'genero', icono: 'swords' },
] as const;

export type TipoAmbiente = (typeof AMBIENTES)[number]['id'];

// Nivel de cada uno (RMS). La música y los tambores se dejan un poco más bajos que la naturaleza.
const NIVEL: Record<TipoAmbiente, number> = {
  playa: 0.05,
  bosque: 0.05,
  lluvia: 0.045,
  terror: 0.04,
  suspenso: 0.035,
  drama: 0.035,
  accion: 0.03,
};

const FUNDIDO = 3; // s de cruce entre una grabación y la otra
const BORDE = 0.05; // s que se recortan (el MP3 trae un poco de silencio en los bordes)

/** Iguala el volumen (RMS) y recorta los bordes. */
function igualar(ctx: BaseAudioContext, b: AudioBuffer, nivel: number): AudioBuffer {
  const recorte = Math.floor(BORDE * b.sampleRate);
  const largo = b.length - 2 * recorte;
  let suma = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = recorte; i < recorte + largo; i++) suma += d[i] * d[i];
  }
  const rms = Math.sqrt(suma / (largo * b.numberOfChannels));
  const g = rms > 1e-6 ? Math.min(20, nivel / rms) : 1;
  const salida = ctx.createBuffer(2, largo, b.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ent = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
    const sal = salida.getChannelData(c);
    for (let i = 0; i < largo; i++) sal[i] = ent[recorte + i] * g;
  }
  return salida;
}

/**
 * Une las grabaciones en un bucle sin costuras: A → B → (vuelve a A), con fundidos de igual
 * potencia entre cada una.
 */
export function unirEnBucle(ctx: BaseAudioContext, partes: AudioBuffer[], fundido = FUNDIDO): AudioBuffer {
  const sr = partes[0].sampleRate;
  const n = Math.floor(fundido * sr);
  const util = partes.map((p) => p.length - n); // cada parte aporta su largo menos el cruce
  const total = util.reduce((a, b) => a + b, 0);
  const salida = ctx.createBuffer(2, total, sr);
  for (let c = 0; c < 2; c++) {
    const sal = salida.getChannelData(c);
    let pos = 0;
    const canal = (p: AudioBuffer) => p.getChannelData(Math.min(c, p.numberOfChannels - 1));
    partes.forEach((p, k) => {
      const d = canal(p);
      // El comienzo de cada parte ya está mezclado con el final de la anterior (salvo la primera,
      // que se mezcla con el final de la última al cerrar el bucle).
      for (let i = n; i < p.length; i++) sal[pos + i - n] = d[i];
      const siguiente = canal(partes[(k + 1) % partes.length]);
      const inicioCruce = pos + p.length - 2 * n;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const destino = (inicioCruce + i + total) % total;
        sal[destino] = d[p.length - n + i] * Math.cos((t * Math.PI) / 2) + siguiente[i] * Math.sin((t * Math.PI) / 2);
      }
      pos += util[k];
    });
  }
  return salida;
}

class Ambiente {
  private deseado: TipoAmbiente | null = null;
  private volumen = 0.6;
  /** Lo que suena ahora (para las pruebas). */
  get actual() {
    return this.sonando?.tipo ?? null;
  }

  private sonando: { tipo: TipoAmbiente; fuente: AudioBufferSourceNode; ganancia: GainNode } | null = null;
  private bucles = new Map<TipoAmbiente, Promise<AudioBuffer>>();
  private salida: { entrada: AudioNode; ganancia: GainNode } | null = null;
  private pedido = 0;

  constructor() {
    sonido.alDespertar = () => this.aplicar();
  }

  /** El sonido de fondo que se quiere (o ninguno). Suena en cuanto el audio esté encendido. */
  poner(tipo: TipoAmbiente | null) {
    if (tipo === this.deseado) return;
    this.deseado = tipo;
    this.aplicar();
  }

  ponerVolumen(v: number) {
    this.volumen = v;
    const ctx = sonido.contexto;
    if (ctx && this.salida) this.salida.ganancia.gain.setTargetAtTime(this.nivel(), ctx.currentTime, 0.08);
  }

  private nivel() {
    return this.volumen * this.volumen * 0.9; // la oreja oye en escala logarítmica
  }

  private bus(ctx: AudioContext) {
    if (!this.salida) {
      // El compresor evita que un chasquido de la fogata o un tambor salten por encima del resto.
      const entrada = ctx.createDynamicsCompressor();
      entrada.threshold.value = -20;
      entrada.knee.value = 12;
      entrada.ratio.value = 4;
      entrada.attack.value = 0.005;
      entrada.release.value = 0.3;
      const ganancia = ctx.createGain();
      ganancia.gain.value = this.nivel();
      entrada.connect(ganancia).connect(ctx.destination);
      this.salida = { entrada, ganancia };
    }
    return this.salida.entrada;
  }

  private cargar(ctx: AudioContext, tipo: TipoAmbiente): Promise<AudioBuffer> {
    let p = this.bucles.get(tipo);
    if (!p) {
      const traer = async (n: number) => {
        const r = await fetch(`${import.meta.env.BASE_URL}ambiente/${tipo}-${n}.mp3`);
        if (!r.ok) throw new Error(`Falta el sonido ${tipo}-${n}`);
        return igualar(ctx, await ctx.decodeAudioData(await r.arrayBuffer()), NIVEL[tipo]);
      };
      p = Promise.all([traer(1), traer(2)]).then((partes) => unirEnBucle(ctx, partes));
      p.catch(() => this.bucles.delete(tipo));
      this.bucles.set(tipo, p);
      // Solo se guarda en memoria el que suena y uno más (cada uno pesa unos 20 MB ya decodificado).
      while (this.bucles.size > 2) this.bucles.delete(this.bucles.keys().next().value!);
    }
    return p;
  }

  private aplicar() {
    const ctx = sonido.contexto;
    if (!ctx) return; // se enciende con el primer toque
    const tipo = this.deseado;
    if (this.sonando?.tipo === tipo) return;
    this.callar(1.2);
    if (!tipo) return;
    const pedido = ++this.pedido;
    this.cargar(ctx, tipo).then(
      (bucle) => {
        if (pedido !== this.pedido || this.deseado !== tipo) return;
        const fuente = ctx.createBufferSource();
        fuente.buffer = bucle;
        fuente.loop = true;
        const ganancia = ctx.createGain();
        ganancia.gain.value = 0;
        fuente.connect(ganancia).connect(this.bus(ctx));
        // Empieza en un punto al azar y entra despacio.
        fuente.start(0, Math.random() * bucle.duration);
        ganancia.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
        this.sonando = { tipo, fuente, ganancia };
      },
      (e) => console.warn('No se pudo cargar el sonido de fondo', e),
    );
  }

  private callar(fundido: number) {
    const ctx = sonido.contexto;
    const s = this.sonando;
    if (!ctx || !s) return;
    this.sonando = null;
    s.ganancia.gain.cancelScheduledValues(ctx.currentTime);
    s.ganancia.gain.setTargetAtTime(0, ctx.currentTime, fundido / 4);
    s.fuente.stop(ctx.currentTime + fundido + 0.1);
  }
}

export const ambiente = new Ambiente();

// Para las pruebas automáticas (solo en desarrollo).
if (import.meta.env.DEV) (globalThis as { __ambiente?: unknown }).__ambiente = ambiente;
