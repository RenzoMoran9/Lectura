// Sonido de la hoja con Web Audio:
//  - un roce en bucle mientras la hoja se mueve: su volumen y su brillo siguen la velocidad del dedo;
//  - un golpecito suave cuando la hoja se asienta.
// Hay varias grabaciones de cada uno y se eligen al azar, para que no suene siempre igual.
// Dos juegos: «libro nuevo» (papel firme) y «libro antiguo» (papel seco y quebradizo).

export type JuegoSonido = 'nuevo' | 'antiguo';

const ARCHIVOS: Record<JuegoSonido, { roce: string[]; golpe: string[] }> = {
  nuevo: {
    roce: ['roce-nuevo-1', 'roce-nuevo-2'],
    golpe: ['golpe-nuevo-1', 'golpe-nuevo-2', 'golpe-nuevo-3'],
  },
  antiguo: {
    roce: ['roce-antiguo-1', 'roce-antiguo-2'],
    golpe: ['golpe-antiguo-1', 'golpe-antiguo-2', 'golpe-antiguo-3'],
  },
};

interface Juego {
  roce: AudioBuffer[];
  golpe: AudioBuffer[];
}

type Ctx = AudioContext;

const azar = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)];

/** Une el final con el principio (fundido de igual potencia) para que el bucle no tenga costura. */
// Antes se recortan los bordes: el MP3 trae un poco de silencio al principio y al final.
function hacerBucle(ctx: Ctx, b: AudioBuffer, fundido = 0.3, borde = 0.06): AudioBuffer {
  const recorte = Math.floor(borde * b.sampleRate);
  const util = b.length - 2 * recorte;
  const n = Math.floor(Math.min(fundido * b.sampleRate, util / 4));
  const largo = util - n;
  const salida = ctx.createBuffer(b.numberOfChannels, largo, b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const ent = b.getChannelData(c).subarray(recorte, recorte + util);
    const sal = salida.getChannelData(c);
    sal.set(ent.subarray(0, largo));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      sal[i] = ent[i] * Math.sin((t * Math.PI) / 2) + ent[largo + i] * Math.cos((t * Math.PI) / 2);
    }
  }
  return salida;
}

/** Ajusta el nivel (RMS para el roce; pico para el golpe) y quita el silencio del principio. */
function normalizar(ctx: Ctx, b: AudioBuffer, modo: 'rms' | 'pico', objetivo: number): AudioBuffer {
  let inicio = 0;
  const umbral = 0.02;
  if (modo === 'pico') {
    const d = b.getChannelData(0);
    while (inicio < d.length && Math.abs(d[inicio]) < umbral) inicio++;
    inicio = Math.max(0, inicio - Math.floor(b.sampleRate * 0.004));
  }
  const largo = b.length - inicio;
  let medida = 0;
  let suma = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = inicio; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > medida) medida = v;
      suma += v * v;
    }
  }
  if (modo === 'rms') medida = Math.sqrt(suma / (largo * b.numberOfChannels));
  const g = medida > 1e-5 ? objetivo / medida : 1;
  const salida = ctx.createBuffer(b.numberOfChannels, largo, b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const ent = b.getChannelData(c);
    const sal = salida.getChannelData(c);
    for (let i = 0; i < largo; i++) sal[i] = Math.max(-1, Math.min(1, ent[inicio + i] * g));
  }
  return salida;
}

export class SonidoPapel {
  private ctx: Ctx | null = null;
  private juegos = new Map<JuegoSonido, Promise<Juego>>();
  private cargados = new Map<JuegoSonido, Juego>();
  private maestro: GainNode | null = null;
  private roce: { fuente: AudioBufferSourceNode; ganancia: GainNode; filtro: BiquadFilterNode } | null = null;
  private velocidad = 0;
  activo = true;
  volumen = 0.7;
  juego: JuegoSonido = 'nuevo';

  /** Hay que llamarlo dentro de un gesto del usuario (tocar la pantalla): así lo exige el navegador. */
  despertar() {
    if (!this.ctx) {
      const Clase = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Clase) return;
      try {
        // En iOS, «ambient» respeta el interruptor de silencio y no corta la música que suene.
        const sesion = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
        if (sesion) sesion.type = 'ambient';
      } catch {
        /* no importa */
      }
      this.ctx = new Clase({ latencyHint: 'interactive' });
      this.maestro = this.ctx.createGain();
      this.maestro.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    void this.cargar(this.juego);
  }

  private cargar(juego: JuegoSonido): Promise<Juego> {
    let p = this.juegos.get(juego);
    if (!p && this.ctx) {
      const ctx = this.ctx;
      const traer = async (nombre: string) => {
        const r = await fetch(`${import.meta.env.BASE_URL}sonidos/${nombre}.mp3`);
        if (!r.ok) throw new Error(`Falta el sonido ${nombre}`);
        const datos = await r.arrayBuffer();
        return await ctx.decodeAudioData(datos);
      };
      p = Promise.all([
        Promise.all(ARCHIVOS[juego].roce.map(traer)),
        Promise.all(ARCHIVOS[juego].golpe.map(traer)),
      ]).then(([roce, golpe]) => ({
        roce: roce.map((b) => hacerBucle(ctx, normalizar(ctx, b, 'rms', 0.16))),
        golpe: golpe.map((b) => normalizar(ctx, b, 'pico', 0.62)),
      }));
      p.then(
        (j) => this.cargados.set(juego, j),
        (e) => {
          console.warn('No se pudieron cargar los sonidos', e);
          this.juegos.delete(juego);
        },
      );
      this.juegos.set(juego, p);
    }
    return p ?? Promise.reject(new Error('Audio sin iniciar'));
  }

  /** El juego actual, solo si ya está cargado: en medio del gesto no se espera. */
  private listo(): Juego | null {
    return this.cargados.get(this.juego) ?? null;
  }

  private get nivel() {
    return this.activo ? this.volumen : 0;
  }

  /** Empieza el roce (en silencio: suena cuando la hoja se mueve). */
  empezarRoce() {
    const ctx = this.ctx;
    const j = this.listo();
    if (!ctx || !j || !this.maestro || this.nivel === 0) return;
    this.pararRoce(0.02);
    const buf = azar(j.roce);
    const fuente = ctx.createBufferSource();
    fuente.buffer = buf;
    fuente.loop = true;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 2500;
    filtro.Q.value = 0.4;
    const ganancia = ctx.createGain();
    ganancia.gain.value = 0;
    fuente.connect(filtro).connect(ganancia).connect(this.maestro);
    fuente.start(0, Math.random() * buf.duration);
    this.roce = { fuente, ganancia, filtro };
    this.velocidad = 0;
  }

  /** Velocidad de la hoja en px CSS por milisegundo. */
  moverRoce(velocidad: number) {
    const ctx = this.ctx;
    if (!ctx || !this.roce) return;
    // Suavizado: el papel no se calla de golpe entre dos movimientos del dedo.
    this.velocidad = this.velocidad * 0.55 + velocidad * 0.45;
    const v = Math.min(1, this.velocidad / 1.3);
    const t = ctx.currentTime;
    this.roce.ganancia.gain.setTargetAtTime(this.nivel * Math.pow(v, 0.75) * 0.95, t, 0.035);
    this.roce.filtro.frequency.setTargetAtTime(1400 + 9000 * v * v, t, 0.05);
    this.roce.fuente.playbackRate.setTargetAtTime(0.9 + 0.22 * v, t, 0.08);
  }

  pararRoce(fundido = 0.08) {
    const ctx = this.ctx;
    const r = this.roce;
    if (!ctx || !r) return;
    this.roce = null;
    r.ganancia.gain.cancelScheduledValues(ctx.currentTime);
    r.ganancia.gain.setTargetAtTime(0, ctx.currentTime, fundido / 3);
    r.fuente.stop(ctx.currentTime + fundido + 0.05);
  }

  /** El golpecito de la hoja al asentarse. `fuerza` entre 0 y 1. */
  golpe(fuerza = 1) {
    const ctx = this.ctx;
    const j = this.listo();
    if (!ctx || !j || !this.maestro || this.nivel === 0) return;
    const fuente = ctx.createBufferSource();
    fuente.buffer = azar(j.golpe);
    fuente.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = ctx.createGain();
    g.gain.value = this.nivel * (0.35 + 0.65 * fuerza) * (0.9 + Math.random() * 0.2);
    fuente.connect(g).connect(this.maestro);
    fuente.start();
  }

  /** Para «Probar sonido»: una hoja pasando, con su roce y su golpe. */
  probar() {
    this.despertar();
    const ctx = this.ctx;
    if (!ctx) return;
    void this.cargar(this.juego).then((j) => {
      this.cargados.set(this.juego, j);
      this.empezarRoce();
      const inicio = performance.now();
      const paso = () => {
        const t = (performance.now() - inicio) / 520;
        if (t >= 1) {
          this.pararRoce();
          this.golpe(1);
          return;
        }
        this.moverRoce(Math.sin(Math.PI * t) * 2.2);
        requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }, () => {});
  }

  cambiarJuego(juego: JuegoSonido) {
    this.juego = juego;
    if (this.ctx) void this.cargar(juego);
  }
}

export const sonido = new SonidoPapel();
