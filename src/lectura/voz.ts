// Lectura en voz alta: el texto de la página se lee por oraciones con las voces del sistema
// (speechSynthesis; en la mayoría de los celulares funcionan sin internet). La oración que se lee
// se ilumina en la página y, al terminar la página, la hoja pasa sola y se sigue leyendo.

import { rectangulos, textoEntre, type Letra, type TextoPagina } from '../frases/texto';

export interface Oracion {
  /** Primera y última letra (inclusive) en `TextoPagina.letras`. */
  desde: number;
  hasta: number;
  /** Lo que se dice: los renglones unidos, sin los guiones de las palabras cortadas. */
  texto: string;
}

/** Un rectángulo de la página, en fracciones de la página (0..1, desde arriba a la izquierda). */
export type RangoPagina = { x0: number; y0: number; x1: number; y1: number };

const FIN = /[.!?…]/;
const CIERRE = /[»"”’')\]]/;
// Lo que puede empezar una oración: mayúscula, número o signo de apertura (¿ ¡ « — …).
const EMPIEZA = /[\p{Lu}\d¿¡«"“‘'(\[—–-]/u;
// Abreviaturas comunes: su punto no cierra la oración.
const ABREVIATURAS = new Set(
  'sr sra srta sres dr dra drs ud uds vd vds dña pág págs pag cap caps núm num art ej vol vols ed fig cf vs aprox av avda sto sta gral lic ing prof mr mrs ms jr st cía nº'.split(' '),
);

const blanco = (l: Letra | undefined) => !l || l.virtual || /\s/.test(l.c);
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
};

/**
 * Divide el texto de una página en trozos para leer: oraciones, y los títulos o encabezados
 * sueltos aparte. Las oraciones muy largas se cortan en una coma o un punto y coma (así ningún
 * trozo dura demasiado: algunos navegadores se callan en mitad de un texto largo). Se dejan fuera
 * los números sueltos (de página) y los textos cortos en letra chica (encabezados y pies).
 */
export function oraciones(t: TextoPagina, max = 200): Oracion[] {
  const L = t.letras;
  // Medidas de cada renglón, para reconocer títulos, fines de párrafo y saltos grandes.
  const renglones = new Map<number, { x0: number; x1: number; top: number; bottom: number }>();
  const altos: number[] = [];
  for (const l of L) {
    if (blanco(l)) continue;
    altos.push(l.bottom - l.top);
    const r = renglones.get(l.linea);
    if (!r) renglones.set(l.linea, { x0: l.x0, x1: l.x1, top: l.top, bottom: l.bottom });
    else {
      r.x0 = Math.min(r.x0, l.x0);
      r.x1 = Math.max(r.x1, l.x1);
      r.top = Math.min(r.top, l.top);
      r.bottom = Math.max(r.bottom, l.bottom);
    }
  }
  const altoTipico = mediana(altos);
  const bordeDerecho = mediana([...renglones.values()].map((r) => r.x1));
  const bordeIzquierdo = mediana([...renglones.values()].map((r) => r.x0));
  const anchoTipico = Math.max(1, bordeDerecho - bordeIzquierdo);

  const siguienteLetra = (k: number) => {
    while (k < L.length && blanco(L[k])) k++;
    return k < L.length ? k : -1;
  };
  const anteriorLetra = (k: number) => {
    while (k >= 0 && blanco(L[k])) k--;
    return k;
  };
  /** La palabra que termina en la letra k (sin el punto). */
  const palabraAntes = (k: number) => {
    let a = k;
    while (a > 0 && !blanco(L[a - 1])) a--;
    return L.slice(a, k + 1)
      .map((l) => l.c)
      .join('')
      .replace(/^[¿¡«"“‘'(\[—–-]+/u, '');
  };

  const trozos: [number, number][] = [];
  let a = -1;
  for (let k = 0; k < L.length; k++) {
    const l = L[k];
    if (a < 0) {
      if (blanco(l)) continue;
      a = k;
    }
    if (!blanco(l) && FIN.test(l.c)) {
      let j = k;
      while (j + 1 < L.length && (FIN.test(L[j + 1].c) || CIERRE.test(L[j + 1].c)) && !blanco(L[j + 1])) j++;
      const sig = siguienteLetra(j + 1);
      const palabra = palabraAntes(k - 1);
      const abreviatura = l.c === '.' && j === k && (ABREVIATURAS.has(palabra.toLowerCase()) || /^\p{L}$/u.test(palabra));
      // «1. Sueños de destino»: el número de un capítulo o de una lista va con lo que sigue.
      const numeral = l.c === '.' && j === k && /^\d{1,3}$/.test(palabra) && k - palabra.length <= a;
      if ((j + 1 >= L.length || blanco(L[j + 1])) && (sig < 0 || EMPIEZA.test(L[sig].c)) && !abreviatura && !numeral) {
        trozos.push([a, j]);
        a = -1;
        k = j;
        continue;
      }
    }
    // Fin de renglón: un salto grande, o un renglón corto (título, fin de párrafo) antes de algo
    // que empieza con mayúscula, también cierra el trozo.
    if (l.virtual && l.c === '\n') {
      const fin = anteriorLetra(k - 1);
      const sig = siguienteLetra(k + 1);
      if (fin < a || sig < 0) continue;
      const r = renglones.get(L[fin].linea);
      const s = renglones.get(L[sig].linea);
      if (!r || !s) continue;
      const salto = s.top - r.bottom > Math.max(altoTipico, r.bottom - r.top) * 1.1;
      const corto = r.x1 < bordeDerecho - anchoTipico * 0.2 && EMPIEZA.test(L[sig].c);
      const guion = /[-‐­]/.test(L[fin].c);
      if ((salto || corto) && !guion) {
        trozos.push([a, fin]);
        a = -1;
      }
    }
  }
  if (a >= 0) {
    const fin = anteriorLetra(L.length - 1);
    if (fin >= a) trozos.push([a, fin]);
  }

  const resultado: Oracion[] = [];
  for (const [desde, hasta] of trozos)
    for (const [d, h] of partir(L, desde, hasta, max)) {
      const texto = textoEntre(t, d, h);
      if (!/\p{L}/u.test(texto)) continue; // números de página, viñetas sueltas
      const letras = L.slice(d, h + 1).filter((x) => !blanco(x));
      const alto = mediana(letras.map((x) => x.bottom - x.top));
      if (texto.length < 60 && altoTipico > 0 && alto < altoTipico * 0.72) continue; // encabezados y pies en letra chica
      resultado.push({ desde: d, hasta: h, texto });
    }
  return resultado;
}

/** Corta un trozo largo en partes de hasta `max` letras, mejor en una coma, un punto y coma o una raya. */
function partir(L: Letra[], desde: number, hasta: number, max: number): [number, number][] {
  const partes: [number, number][] = [];
  let a = desde;
  while (hasta - a + 1 > max) {
    let corte = -1;
    let espacio = -1;
    for (let k = a + Math.floor(max * 0.35); k <= Math.min(hasta - 1, a + max); k++) {
      if (blanco(L[k + 1]) && !blanco(L[k]) && /[,;:—–)]/.test(L[k].c)) corte = k;
      if (blanco(L[k + 1]) && !blanco(L[k])) espacio = k;
    }
    const fin = corte >= 0 ? corte : espacio >= 0 ? espacio : a + max;
    partes.push([a, fin]);
    a = fin + 1;
    while (a <= hasta && blanco(L[a])) a++;
  }
  if (a <= hasta) partes.push([a, hasta]);
  return partes;
}

/** El trozo que contiene la letra `letra` (o el siguiente, si cae entre dos). */
export function oracionEn(ors: Oracion[], letra: number): number {
  if (letra < 0) return 0;
  const i = ors.findIndex((o) => o.hasta >= letra);
  return i < 0 ? Math.max(0, ors.length - 1) : i;
}

/** El primer trozo que empieza a la vista (desde la altura `y` de la página, en fracciones). */
export function oracionDesdeAltura(t: TextoPagina, ors: Oracion[], alto: number, y: number): number {
  const i = ors.findIndex((o) => t.letras[o.desde].top / alto >= y - 0.005);
  return i < 0 ? 0 : i;
}

/** Los renglones de un trozo, en fracciones de la página. */
export function rangosDe(t: TextoPagina, o: Oracion, ancho: number, alto: number): RangoPagina[] {
  return rectangulos(t, o.desde, o.hasta).map(([x, y, w, h]) => ({ x0: x / ancho, y0: y / alto, x1: (x + w) / ancho, y1: (y + h) / alto }));
}

// ---------- Voces ----------

const REGIONES: Record<string, string> = {
  ES: 'España', MX: 'México', US: 'EE. UU.', AR: 'Argentina', CO: 'Colombia', CL: 'Chile', PE: 'Perú', VE: 'Venezuela',
  '419': 'Latinoamérica', UY: 'Uruguay', BO: 'Bolivia', EC: 'Ecuador', PY: 'Paraguay', CR: 'Costa Rica', DO: 'Rep. Dominicana',
  GT: 'Guatemala', HN: 'Honduras', NI: 'Nicaragua', PA: 'Panamá', PR: 'Puerto Rico', SV: 'El Salvador', CU: 'Cuba',
};
const regionDe = (lang: string) => lang.split(/[-_]/)[1]?.toUpperCase() ?? '';

export interface VozInfo {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

/** Las voces en español, primero las de mi país, luego las de Latinoamérica y al final las de España. */
export function vocesEnEspanol<V extends VozInfo>(todas: V[], idioma = 'es'): V[] {
  const mia = regionDe(idioma);
  const puntaje = (v: V) => {
    const r = regionDe(v.lang);
    return (r && r === mia ? 0 : r === 'ES' ? 20 : 10) + (v.localService ? 0 : 2) + (v.default ? 0 : 1);
  };
  return todas.filter((v) => /^es(?:$|[-_])/i.test(v.lang)).sort((a, b) => puntaje(a) - puntaje(b));
}

/** Un nombre corto para la voz: «Paulina (México)», «Google (EE. UU.)». */
export function nombreVoz(v: VozInfo): string {
  let n = v.name
    .replace(/^(Microsoft|Apple)\s+/i, '')
    .replace(/\s+(Online|Natural)\b.*$/i, '')
    .split(/\s+[-–]\s+|\s*\(/)[0]
    .trim();
  if (/^google\b/i.test(n)) n = 'Google';
  if (!n || /espa[ñn]ol|spanish/i.test(n) || /^[a-z]{2}[-_][a-z]{2}/i.test(n)) n = 'Voz';
  const r = regionDe(v.lang);
  return r ? `${n} (${REGIONES[r] ?? r})` : n;
}

/** Los nombres de una lista de voces, numerados si se repiten («Voz (México)», «Voz 2 (México)»). */
export function nombresVoces(voces: VozInfo[]): string[] {
  const vistos = new Map<string, number>();
  return voces.map((v) => {
    const n = nombreVoz(v);
    const k = (vistos.get(n) ?? 0) + 1;
    vistos.set(n, k);
    return k === 1 ? n : n.replace(/^(\S+)/, `$1 ${k}`);
  });
}

// ---------- La voz que habla ----------

/** Lo que se usa de `speechSynthesis` (para poder probarlo sin navegador). */
export interface Sintesis {
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  readonly speaking: boolean;
  readonly pending: boolean;
}

export const hayVoz = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export interface OpcionesDecir {
  velocidad: number;
  alTerminar: () => void;
  alFallar: (error: string) => void;
}

/** Quien dice las oraciones: la voz del sistema (Narrador) o una voz propia de la app. */
export interface Locutor {
  /** Dentro de un toque: el navegador solo deja empezar a sonar así. */
  despertar(): void;
  decir(texto: string, o: OpcionesDecir): void;
  callar(): void;
  /** Deja lista la oración que viene (las voces propias tardan un poco en generarla). */
  preparar?(texto: string, velocidad: number): void;
}

/**
 * Dice un texto con la voz del sistema y avisa al terminar. Cada `decir` deja sin efecto lo
 * anterior: los avisos de un texto cortado no llegan. Si el navegador no avisa que terminó (pasa
 * en algunos celulares), se nota porque ya no está hablando.
 */
export class Narrador implements Locutor {
  /** La voz elegida (si no hay, la del sistema para español). */
  voz?: SpeechSynthesisVoice;
  private turno = 0;
  private vigente: SpeechSynthesisUtterance | null = null; // (si no se guarda, Chrome puede perder el aviso de fin)
  private vigia: ReturnType<typeof setInterval> | undefined;
  private respiro: ReturnType<typeof setInterval> | undefined;

  constructor(
    private s: Sintesis = window.speechSynthesis,
    private Enunciado: typeof SpeechSynthesisUtterance = window.SpeechSynthesisUtterance,
  ) {}

  /** En el iPhone la voz solo se enciende dentro de un toque: se dice algo mudo al tocar ▶. */
  despertar() {
    try {
      const u = new this.Enunciado(' ');
      u.volume = 0;
      this.s.speak(u);
    } catch {
      /* sin voz: se avisa al intentar leer */
    }
  }

  decir(texto: string, o: OpcionesDecir) {
    this.parar();
    const turno = ++this.turno;
    const u = new this.Enunciado(texto);
    const voz = this.voz;
    u.lang = voz?.lang ?? 'es-ES';
    if (voz) u.voice = voz;
    u.rate = o.velocidad;
    let listo = false;
    const terminar = (error?: string) => {
      if (listo || turno !== this.turno) return;
      listo = true;
      this.parar();
      if (error) o.alFallar(error);
      else o.alTerminar();
    };
    u.onend = () => terminar();
    u.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      terminar(e.error || 'error');
    };
    this.vigente = u;
    this.s.speak(u);
    const inicio = Date.now();
    this.vigia = setInterval(() => {
      if (Date.now() - inicio > 1500 && !this.s.speaking && !this.s.pending) terminar();
    }, 700);
    // Chrome en la computadora se calla a los ~15 s con las voces en línea: una pausa mínima lo evita.
    if (voz && !voz.localService && !/android/i.test(globalThis.navigator?.userAgent ?? ''))
      this.respiro = setInterval(() => {
        if (!this.s.speaking) return;
        this.s.pause();
        this.s.resume();
      }, 9000);
  }

  callar() {
    this.turno++;
    this.parar();
    this.vigente = null;
    this.s.cancel();
  }

  private parar() {
    clearInterval(this.vigia);
    clearInterval(this.respiro);
  }

  get hablando() {
    return !!this.vigente;
  }
}

// ---------- Leer el libro ----------

export type FaseVoz = 'cargando' | 'leyendo' | 'pausa' | 'pasando';

export interface EstadoVoz {
  fase: FaseVoz;
  pagina: number;
  /** Lo que se está leyendo, un rectángulo por renglón (en fracciones de la página). */
  rangos: RangoPagina[];
}

export interface TextoConMedida {
  texto: TextoPagina;
  ancho: number;
  alto: number;
}

export interface OpcionesLectura {
  /** El texto de una página, con la medida de la página (en las mismas unidades que las letras). */
  texto: (pagina: number) => Promise<TextoConMedida | null>;
  visibles: () => number[];
  total: () => number;
  /** Pasa la hoja hacia adelante (con su sonido). */
  pasar: () => void;
  /** Quién lee ahora (cambia si elijo otra voz). */
  locutor: () => Locutor;
  velocidad: () => number;
  alCambiar: (e: EstadoVoz | null) => void;
  alAviso: (texto: string) => void;
  /** Cada vez que empieza una oración (la pantalla no se apaga mientras se escucha). */
  alHablar?: () => void;
}

/** Con cuántas páginas seguidas sin texto (ilustraciones) se deja de leer. */
const MAX_SIN_TEXTO = 3;

export class LecturaEnVoz {
  private fase: FaseVoz | null = null;
  private pagina = 0;
  private texto: TextoConMedida | null = null;
  private ors: Oracion[] = [];
  private i = 0;
  private sesion = 0;
  private sinTexto = 0;
  private fallos = 0;
  /** En pausa cambió la página: al seguir, se empieza desde esa. */
  private pendiente: number | null = null;
  private espera: ReturnType<typeof setTimeout> | undefined;
  private reintento: ReturnType<typeof setTimeout> | undefined;
  /** El último que habló (para callarlo si cambio de voz). */
  private ultimo: Locutor | null = null;

  constructor(private o: OpcionesLectura) {}

  /** Quién habló por última vez. */
  get enUso() {
    return this.ultimo;
  }

  private callar() {
    this.ultimo?.callar();
  }

  get activa() {
    return this.fase !== null;
  }

  /** Empieza a leer en una página, desde la letra que diga `desde` (o desde arriba). */
  empezar(pagina: number, desde?: (t: TextoConMedida, ors: Oracion[]) => number) {
    if (this.fase) this.callar();
    this.o.locutor().despertar();
    this.pendiente = null;
    this.sinTexto = 0;
    this.fallos = 0;
    void this.cargar(pagina, desde, true);
  }

  pausar() {
    if (!this.fase || this.fase === 'pausa') return;
    this.sesion++;
    clearTimeout(this.reintento);
    this.callar();
    this.fase = 'pausa';
    this.emitir();
  }

  seguir() {
    if (this.fase !== 'pausa') return;
    this.o.locutor().despertar();
    this.fallos = 0;
    const p = this.pendiente;
    this.pendiente = null;
    if (p !== null || !this.texto) void this.cargar(p ?? this.pagina);
    else this.despues(() => this.hablar());
  }

  /** La voz o la velocidad cambió: la oración se dice de nuevo, con la nueva. */
  repetir() {
    if (this.fase !== 'leyendo') return;
    this.sesion++;
    this.callar();
    this.despues(() => this.hablar());
  }

  detener() {
    this.sesion++;
    clearTimeout(this.espera);
    clearTimeout(this.reintento);
    if (this.fase) this.callar();
    this.fase = null;
    this.texto = null;
    this.pendiente = null;
    this.o.alCambiar(null);
  }

  /** La página que se ve cambió (pasó sola, la pasé yo o salté a otra). */
  cambioDePagina() {
    if (!this.fase) return;
    const vis = this.o.visibles();
    if (this.fase !== 'pasando' && vis.includes(this.pagina)) return;
    const p = vis[0] ?? this.pagina;
    if (this.fase === 'pausa') {
      this.pendiente = p;
      this.pagina = p;
      this.texto = null;
      this.emitir();
      return;
    }
    clearTimeout(this.reintento);
    this.sesion++;
    this.callar();
    this.despues(() => void this.cargar(p));
  }

  private despues(f: () => void) {
    clearTimeout(this.espera);
    // Tras callar, algunos navegadores necesitan un respiro antes de volver a hablar.
    this.espera = setTimeout(f, 60);
  }

  private async cargar(pagina: number, desde?: (t: TextoConMedida, ors: Oracion[]) => number, primera = false) {
    const sesion = ++this.sesion;
    this.fase = 'cargando';
    this.pagina = pagina;
    this.texto = null;
    this.ors = [];
    this.emitir();
    let t: TextoConMedida | null = null;
    try {
      t = await this.o.texto(pagina);
    } catch {
      t = null;
    }
    if (sesion !== this.sesion) return;
    const ors = t?.texto.tieneTexto ? oraciones(t.texto) : [];
    if (!t || !ors.length) {
      // Página sin texto: escaneada o una ilustración.
      if (primera) {
        this.detener();
        this.o.alAviso('Esta página es una imagen: no tiene texto para leer en voz alta.');
        return;
      }
      if (++this.sinTexto >= MAX_SIN_TEXTO) {
        this.detener();
        this.o.alAviso('Estas páginas no tienen texto: dejé de leer.');
        return;
      }
      this.finDePagina();
      return;
    }
    this.sinTexto = 0;
    this.texto = t;
    this.ors = ors;
    this.i = desde ? Math.max(0, Math.min(ors.length - 1, desde(t, ors))) : 0;
    this.hablar();
  }

  private hablar() {
    const t = this.texto;
    const o = this.ors[this.i];
    if (!t || !o) return this.finDePagina();
    const sesion = this.sesion;
    this.fase = 'leyendo';
    this.emitir();
    this.o.alHablar?.();
    const loc = this.o.locutor();
    if (this.ultimo && this.ultimo !== loc) this.ultimo.callar();
    this.ultimo = loc;
    const velocidad = this.o.velocidad();
    loc.decir(o.texto, {
      velocidad,
      alTerminar: () => {
        if (sesion !== this.sesion) return;
        this.fallos = 0;
        this.i++;
        if (this.i < this.ors.length) this.hablar();
        else this.finDePagina();
      },
      alFallar: (error) => {
        if (sesion !== this.sesion) return;
        if (error === 'not-allowed' || ++this.fallos >= 3) {
          this.pausar();
          this.o.alAviso(error === 'not-allowed' ? 'Toca ▶ para que empiece a leer.' : 'No se pudo leer en voz alta en este navegador.');
          return;
        }
        this.i++;
        this.hablar();
      },
    });
    // Mientras suena, la que viene ya se va preparando (también la primera de la página siguiente).
    if (loc.preparar) {
      const sig = this.ors[this.i + 1];
      if (sig) loc.preparar(sig.texto, velocidad);
      else void this.prepararPaginaSiguiente(loc, velocidad);
    }
  }

  private async prepararPaginaSiguiente(loc: Locutor, velocidad: number) {
    const p = this.pagina + 1;
    if (p >= this.o.total()) return;
    try {
      const t = await this.o.texto(p);
      const primera = t?.texto.tieneTexto ? oraciones(t.texto)[0] : undefined;
      if (primera) loc.preparar?.(primera.texto, velocidad);
    } catch {
      /* se prepara al llegar */
    }
  }

  private finDePagina() {
    const siguiente = this.pagina + 1;
    if (siguiente >= this.o.total()) {
      this.detener();
      this.o.alAviso('Fin del libro');
      return;
    }
    // En doble página, la de la derecha ya está a la vista: se sigue con ella.
    if (this.o.visibles().includes(siguiente)) {
      void this.cargar(siguiente);
      return;
    }
    this.fase = 'pasando';
    this.texto = null;
    this.emitir();
    const sesion = this.sesion;
    let intentos = 0;
    const pasar = () => {
      if (sesion !== this.sesion || this.fase !== 'pasando') return;
      this.o.pasar();
      // Si la hoja no pasó (el dedo estaba sobre ella), se intenta de nuevo.
      if (++intentos < 8) this.reintento = setTimeout(pasar, 1500);
    };
    pasar();
  }

  private emitir() {
    if (!this.fase) return this.o.alCambiar(null);
    const t = this.texto;
    const o = this.ors[this.i];
    this.o.alCambiar({
      fase: this.fase,
      pagina: this.pagina,
      rangos: t && o && this.fase !== 'pasando' ? rangosDe(t.texto, o, t.ancho, t.alto) : [],
    });
  }
}
