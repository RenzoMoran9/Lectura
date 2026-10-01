// Sonido de la hoja con Web Audio, hecho con grabaciones reales de un libro (CC0, ver
// public/sonidos/LICENCIA.md y scripts/sonido-hoja.py). Una hoja de verdad suena bajito y por
// partes, no como un siseo parejo:
//  - la toma: un chasquido corto cuando el dedo levanta la esquina;
//  - el aire: mientras la hoja cruza, granitos del roce real; con la hoja más rápida hay más
//    granos, más fuertes y un poco más brillantes; con la hoja quieta, silencio;
//  - algún crujido suelto del papel al doblarse (más en el libro antiguo);
//  - el asiento: la hoja que se posa sobre las otras, suave.
// Dos papeles: «libro nuevo» (firme) y «libro antiguo» (seco, más opaco y con más crujidos).

export type JuegoSonido = 'nuevo' | 'antiguo';

/** Cómo suena cada papel: las grabaciones son las mismas, cambia cómo se tocan. */
const PAPELES: Record<JuegoSonido, { tono: number; brillo: number; grave: number; crujidos: number; asiento: number; asientoBrillo: number }> = {
  nuevo: { tono: 1, brillo: 7000, grave: 260, crujidos: 1.2, asiento: 1, asientoBrillo: 7500 },
  antiguo: { tono: 0.88, brillo: 5000, grave: 340, crujidos: 5, asiento: 0.85, asientoBrillo: 4200 },
};

// Niveles a volumen 1 (amplitud). A toda velocidad el aire queda cerca de −25 dBFS y el asiento
// llega a unos −8 dBFS de pico: como una hoja de verdad, que se oye pero no se impone.
const NIVEL_AIRE = 0.72;
const NIVEL_TOMA = 0.11;
const NIVEL_CRUJIDO = 0.09;
const NIVEL_ASIENTO = 0.45;
/** Velocidad de la hoja (px CSS por ms) desde la que el aire suena con toda su fuerza. */
const VELOCIDAD_PLENA = 1.8;

type Trozo = [inicio: number, fin: number];
interface Hoja {
  buffer: AudioBuffer;
  toma: Trozo[];
  aire: Trozo[];
  asiento: Trozo[];
}

/** Lo que suena mientras se marca: lápiz al encerrar, resaltador y goma de borrar. */
export type TipoTrazo = 'lapiz' | 'resaltador' | 'borrador';
const TRAZOS: Record<TipoTrazo, string[]> = {
  lapiz: ['lapiz-1', 'lapiz-2'],
  resaltador: ['resaltador-1'],
  borrador: ['borrador-1'],
};

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

/** Ajusta el nivel (RMS o pico) y, con pico, quita el silencio del principio. */
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
  private maestro: GainNode | null = null;
  private hoja: Hoja | null = null;
  private cargandoHoja: Promise<Hoja> | null = null;
  private roce: {
    entrada: AudioNode;
    agudos: BiquadFilterNode;
    bus: GainNode;
    intensidad: number;
    proximo: number;
    proximoCrujido: number;
  } | null = null;
  private trazos = new Map<TipoTrazo, AudioBuffer[]>();
  private cargandoTrazos = false;
  private trazo: { fuente: AudioBufferSourceNode; ganancia: GainNode; velocidad: number } | null = null;
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
      this.sala(this.ctx, this.maestro);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    void this.cargarHoja().catch(() => {});
    this.cargarTrazos();
    this.alDespertar?.(this.ctx);
  }

  /** Aviso para el sonido de fondo: el audio ya se puede usar. */
  alDespertar?: (ctx: AudioContext) => void;

  /** El contexto de audio, si ya se encendió con un toque. */
  get contexto(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Un poco de cuarto: las grabaciones son de muy cerca, y una hoja se oye a la distancia de los
   * ojos, con los primeros rebotes de la pieza. Eso además suaviza lo áspero del papel.
   */
  private sala(ctx: Ctx, entrada: AudioNode) {
    try {
      const largo = Math.floor(ctx.sampleRate * 0.09);
      const ir = ctx.createBuffer(2, largo, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let y = 0;
        for (let i = 0; i < largo; i++) {
          const t = i / ctx.sampleRate;
          y += ((Math.random() * 2 - 1) * Math.exp(-t / 0.022) - y) * 0.35; // ruido que se apaga, opaco
          d[i] = t < 0.004 ? 0 : y;
        }
      }
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      const humedo = ctx.createGain();
      humedo.gain.value = 0.2;
      entrada.connect(conv).connect(humedo).connect(ctx.destination);
    } catch {
      /* sin sala: suena igual, más seco */
    }
  }

  private cargarHoja(): Promise<Hoja> {
    const ctx = this.ctx;
    if (!ctx) return Promise.reject(new Error('Audio sin iniciar'));
    if (!this.cargandoHoja) {
      const base = `${import.meta.env.BASE_URL}sonidos/`;
      this.cargandoHoja = (async () => {
        const [tabla, datos] = await Promise.all([
          fetch(`${base}hoja.json`).then((r) => {
            if (!r.ok) throw new Error('Falta hoja.json');
            return r.json() as Promise<Omit<Hoja, 'buffer'>>;
          }),
          fetch(`${base}hoja.wav`).then((r) => {
            if (!r.ok) throw new Error('Falta hoja.wav');
            return r.arrayBuffer();
          }),
        ]);
        const hoja = { ...tabla, buffer: await ctx.decodeAudioData(datos) };
        this.hoja = hoja;
        return hoja;
      })();
      this.cargandoHoja.catch((e) => {
        console.warn('No se pudo cargar el sonido de la hoja', e);
        this.cargandoHoja = null;
      });
    }
    return this.cargandoHoja;
  }

  private get nivel() {
    return this.activo ? this.volumen : 0;
  }

  /** Toca un trozo de la grabación de la hoja. */
  private tocar([a, b]: Trozo, cuando: number, nivel: number, tono: number, destino: AudioNode) {
    const ctx = this.ctx;
    const h = this.hoja;
    if (!ctx || !h) return;
    const fuente = ctx.createBufferSource();
    fuente.buffer = h.buffer;
    fuente.playbackRate.value = tono;
    const g = ctx.createGain();
    g.gain.value = nivel;
    fuente.connect(g).connect(destino);
    fuente.onended = () => g.disconnect();
    fuente.start(cuando, a, b - a);
  }

  /** Un granito del aire de la hoja: un trozo corto del roce real, que entra y sale suave. */
  private grano(cuando: number, i: number) {
    const ctx = this.ctx;
    const h = this.hoja;
    const r = this.roce;
    if (!ctx || !h || !r) return;
    const p = PAPELES[this.juego];
    const [a, b] = azar(h.aire);
    const largo = 0.045 + Math.random() * 0.065;
    const tono = p.tono * (0.92 + Math.random() * 0.16) * (0.96 + 0.08 * i);
    const usable = b - a - largo * tono;
    if (usable <= 0) return;
    const fuente = ctx.createBufferSource();
    fuente.buffer = h.buffer;
    fuente.playbackRate.value = tono;
    const g = ctx.createGain();
    const nivel = this.nivel * NIVEL_AIRE * Math.pow(i, 0.9) * (0.55 + 0.45 * Math.random());
    g.gain.setValueAtTime(0, cuando);
    g.gain.linearRampToValueAtTime(nivel, cuando + largo * 0.4);
    g.gain.linearRampToValueAtTime(0, cuando + largo);
    fuente.connect(g).connect(r.entrada);
    fuente.onended = () => g.disconnect();
    fuente.start(cuando, a + Math.random() * usable, largo * tono);
  }

  /** Empieza el roce: el dedo toma la esquina (el aire suena cuando la hoja se mueve). */
  empezarRoce() {
    const ctx = this.ctx;
    const h = this.hoja;
    if (!ctx || !h || !this.maestro || this.nivel === 0) return;
    this.pararRoce(0.02);
    const p = PAPELES[this.juego];
    const graves = ctx.createBiquadFilter();
    graves.type = 'highpass';
    graves.frequency.value = p.grave;
    graves.Q.value = 0.5;
    const agudos = ctx.createBiquadFilter();
    agudos.type = 'lowpass';
    agudos.frequency.value = 2000;
    agudos.Q.value = 0.5;
    const bus = ctx.createGain();
    graves.connect(agudos).connect(bus).connect(this.maestro);
    this.roce = { entrada: graves, agudos, bus, intensidad: 0, proximo: 0, proximoCrujido: 0 };
    this.tocar(azar(h.toma), ctx.currentTime, this.nivel * NIVEL_TOMA * (0.6 + 0.4 * Math.random()), p.tono * (0.95 + Math.random() * 0.1), graves);
  }

  /** Velocidad de la hoja en px CSS por milisegundo. */
  moverRoce(velocidad: number) {
    const ctx = this.ctx;
    const r = this.roce;
    if (!ctx || !r || !this.hoja) return;
    const p = PAPELES[this.juego];
    const ahora = ctx.currentTime;
    // Sube rápido y baja un poco más lento: el papel no se calla de golpe entre dos movimientos.
    const objetivo = Math.min(1, Math.max(0, velocidad) / VELOCIDAD_PLENA);
    r.intensidad += (objetivo - r.intensidad) * (objetivo > r.intensidad ? 0.6 : 0.35);
    const i = r.intensidad;
    r.agudos.frequency.setTargetAtTime(1800 + (p.brillo - 1800) * Math.pow(i, 0.7), ahora, 0.04);
    if (i < 0.02) {
      r.proximo = 0;
      return;
    }
    // Los granos llegan al azar (como el papel), más seguidos cuanto más rápido va la hoja. Se
    // agendan un poquito hacia adelante: si el dedo se detiene, el aire se apaga solo.
    const hasta = ahora + 0.045;
    const densidad = 14 + 66 * Math.pow(i, 0.8);
    if (r.proximo < ahora) r.proximo = ahora + Math.random() / densidad;
    while (r.proximo < hasta) {
      this.grano(r.proximo, i);
      r.proximo += -Math.log(1 - Math.random()) / densidad;
    }
    const tasa = p.crujidos * (0.3 + i);
    if (r.proximoCrujido < ahora) r.proximoCrujido = ahora - Math.log(1 - Math.random()) / tasa;
    while (r.proximoCrujido < hasta) {
      const fuerza = Math.pow(Math.random(), 2) * (0.3 + 0.7 * i);
      this.tocar(azar(this.hoja.toma), r.proximoCrujido, this.nivel * NIVEL_CRUJIDO * fuerza, p.tono * (0.9 + Math.random() * 0.5), r.entrada);
      r.proximoCrujido += -Math.log(1 - Math.random()) / tasa;
    }
  }

  pararRoce(fundido = 0.08) {
    const ctx = this.ctx;
    const r = this.roce;
    if (!ctx || !r) return;
    this.roce = null;
    const t = ctx.currentTime;
    r.bus.gain.cancelScheduledValues(t);
    r.bus.gain.setValueAtTime(r.bus.gain.value, t);
    r.bus.gain.setTargetAtTime(0, t, fundido / 3);
    setTimeout(() => r.bus.disconnect(), (fundido + 0.3) * 1000);
  }

  /** La hoja se posa sobre las otras. `fuerza` entre 0 y 1 (menos si la hoja vuelve a su sitio). */
  golpe(fuerza = 1) {
    const ctx = this.ctx;
    const h = this.hoja;
    if (!ctx || !h || !this.maestro || this.nivel === 0) return;
    const p = PAPELES[this.juego];
    // Un poco opaco: la hoja se posa sobre las otras, no restalla.
    const destino = ctx.createBiquadFilter();
    destino.type = 'lowpass';
    destino.frequency.value = p.asientoBrillo;
    destino.Q.value = 0.5;
    destino.connect(this.maestro);
    setTimeout(() => destino.disconnect(), 600);
    const nivel = this.nivel * NIVEL_ASIENTO * p.asiento * (0.25 + 0.75 * fuerza) * (0.85 + Math.random() * 0.3);
    this.tocar(azar(h.asiento), ctx.currentTime, nivel, p.tono * (0.95 + Math.random() * 0.1), destino);
  }

  /** Para «Probar sonido»: una hoja pasando, con su roce y su asiento. */
  probar() {
    this.despertar();
    if (!this.ctx) return;
    void this.cargarHoja().then(() => {
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

  private cargarTrazos() {
    const ctx = this.ctx;
    if (!ctx || this.cargandoTrazos) return;
    this.cargandoTrazos = true;
    for (const [tipo, nombres] of Object.entries(TRAZOS) as [TipoTrazo, string[]][]) {
      Promise.all(
        nombres.map(async (n) => {
          const r = await fetch(`${import.meta.env.BASE_URL}sonidos/${n}.mp3`);
          if (!r.ok) throw new Error(`Falta el sonido ${n}`);
          return hacerBucle(ctx, normalizar(ctx, await ctx.decodeAudioData(await r.arrayBuffer()), 'rms', 0.14), 0.12);
        }),
      ).then(
        (b) => this.trazos.set(tipo, b),
        (e) => console.warn('No se pudo cargar el sonido de marcar', e),
      );
    }
  }

  /** Empieza el sonido de marcar (en silencio: suena cuando el dedo se mueve). */
  empezarTrazo(tipo: TipoTrazo) {
    const ctx = this.ctx;
    const bufs = this.trazos.get(tipo);
    if (!ctx || !bufs || !this.maestro || this.nivel === 0) return;
    this.pararTrazo(0.02);
    const buf = azar(bufs);
    const fuente = ctx.createBufferSource();
    fuente.buffer = buf;
    fuente.loop = true;
    const ganancia = ctx.createGain();
    ganancia.gain.value = 0;
    fuente.connect(ganancia).connect(this.maestro);
    fuente.start(0, Math.random() * buf.duration);
    this.trazo = { fuente, ganancia, velocidad: 0 };
  }

  /** Velocidad del dedo al marcar, en px CSS por milisegundo. */
  moverTrazo(velocidad: number) {
    const ctx = this.ctx;
    const t = this.trazo;
    if (!ctx || !t) return;
    t.velocidad = t.velocidad * 0.5 + velocidad * 0.5;
    const v = Math.min(1, t.velocidad / 0.7);
    t.ganancia.gain.setTargetAtTime(this.nivel * Math.pow(v, 0.7) * 0.75, ctx.currentTime, 0.03);
    t.fuente.playbackRate.setTargetAtTime(0.9 + 0.2 * v, ctx.currentTime, 0.06);
  }

  pararTrazo(fundido = 0.06) {
    const ctx = this.ctx;
    const t = this.trazo;
    if (!ctx || !t) return;
    this.trazo = null;
    t.ganancia.gain.cancelScheduledValues(ctx.currentTime);
    t.ganancia.gain.setTargetAtTime(0, ctx.currentTime, fundido / 3);
    t.fuente.stop(ctx.currentTime + fundido + 0.05);
  }

  cambiarJuego(juego: JuegoSonido) {
    this.juego = juego;
  }
}

export const sonido = new SonidoPapel();
