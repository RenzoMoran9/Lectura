// «A tu medida»: cada página del PDF se parte en hojas del tamaño del celular, con sus renglones
// reacomodados al ancho de la pantalla (ver reacomodo.ts). Se preparan solo las hojas cercanas a
// la que se lee y se sueltan las demás. Las marcas (resaltador, lápiz, recuadro, marcador) se
// dibujan de nuevo sobre la hoja, alrededor de sus palabras ya acomodadas.

import { azar, dibujarFrase, trazoLapiz } from '../frases/dibujo';
import { esLapiz, LAPICES, type Frase, type Punto } from '../frases/modelo';
import { encerradas, enRecuadro, leerTextoPagina, type TextoPagina } from '../frases/texto';
import type { DocumentoPdf } from '../pdf/pdf';
import { dibujarMarcaLectura, type MarcaLectura } from './lugar';
import { dibujarHoja, maquetar, marcarGuiones, parrafosDe, renglonesDeImagen, sinMargenes, type Hoja, type Pieza } from './reacomodo';

/** Las hojas «a tu medida» se numeran aparte: así no se mezclan con las páginas originales. */
export const BASE_CLAVE = 1_000_000;
const POR_PAGINA = 64;
export const clave = (pagina: number, parte: number) => BASE_CLAVE + pagina * POR_PAGINA + Math.min(parte, POR_PAGINA - 1);
export const esClaveMedida = (k: number) => k >= BASE_CLAVE;

/** Densidad con que se busca dónde hay renglones (px por punto del PDF). */
const K_BUSCAR = 2.5;
/** Píxeles que puede tener la página dibujada de donde se recortan las palabras. */
const MAX_FUENTE = 8e6;
const TINTA_TENUE = 'rgba(42, 37, 32, 0.46)';

export interface OpcionesMedida {
  /** Hoja (px CSS) y densidad. */
  ancho: number;
  alto: number;
  dpr: number;
  /** Alto de un renglón de letra normal (px CSS). */
  letra: number;
  titulo: string;
}

/** Cómo quedó una página: sus hojas y su tamaño (unidades de la página). */
export interface Disposicion {
  hojas: Hoja[];
  escala: number;
  ancho: number;
  alto: number;
  /** Su texto (si tiene): para saber qué palabras encierra un lápiz o un recuadro. */
  texto?: TextoPagina | null;
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Los trozos de un rectángulo de la página original (unidades) en una hoja, en px CSS de la hoja. */
export function rectsEnHoja(hoja: Hoja, r: Rect): { x: number; y: number; w: number; h: number }[] {
  const salida: { x: number; y: number; w: number; h: number }[] = [];
  for (const p of hoja.piezas) {
    const ix0 = Math.max(r.x0, p.sx);
    const ix1 = Math.min(r.x1, p.sx + p.sw);
    const iy0 = Math.max(r.y0, p.sy);
    const iy1 = Math.min(r.y1, p.sy + p.sh);
    // Que el rectángulo tome de verdad la palabra (no solo el borde de la del renglón vecino).
    if (ix1 - ix0 < Math.min(p.sw * 0.3, 2) || iy1 - iy0 < p.sh * 0.4) continue;
    const ex = p.w / p.sw;
    const ey = p.h / p.sh;
    salida.push({ x: p.x + (ix0 - p.sx) * ex, y: p.y + (iy0 - p.sy) * ey, w: (ix1 - ix0) * ex, h: (iy1 - iy0) * ey });
  }
  return salida;
}

type RectHoja = { x: number; y: number; w: number; h: number };

/**
 * Junta los trozos vecinos de un mismo renglón nuevo (las palabras seguidas van en un solo trozo),
 * si no los separa más de `hueco` px.
 */
function juntarRenglones(trozos: RectHoja[], hueco = 40): RectHoja[] {
  const juntos: RectHoja[] = [];
  for (const r of trozos) {
    const u = juntos[juntos.length - 1];
    if (u && Math.abs(u.y - r.y) < Math.max(r.h, u.h) * 0.5 && r.x - (u.x + u.w) < hueco) {
      const x1 = Math.max(u.x + u.w, r.x + r.w);
      const y1 = Math.max(u.y + u.h, r.y + r.h);
      u.x = Math.min(u.x, r.x);
      u.y = Math.min(u.y, r.y);
      u.w = x1 - u.x;
      u.h = y1 - u.y;
    } else juntos.push({ ...r });
  }
  return juntos;
}

/** Los renglones nuevos de una hoja por donde pasa un rectángulo de la página original (px CSS). */
export function lineasEnHoja(hoja: Hoja, r: Rect): RectHoja[] {
  return juntarRenglones(rectsEnHoja(hoja, r));
}

/** ¿El punto queda dentro del trazo (cerrado)? */
function dentro(x: number, y: number, t: Punto[]) {
  let si = false;
  for (let i = 0, j = t.length - 1; i < t.length; j = i++) {
    const [xi, yi] = t[i];
    const [xj, yj] = t[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si;
  }
  return si;
}

/**
 * Las palabras de la hoja que caen dentro de una zona de la página original, por renglón nuevo:
 * de la primera a la última, en el orden en que se leen (con todas las de en medio).
 */
function lineasDentro(hoja: Hoja, esta: (p: Pieza) => boolean): RectHoja[] {
  const dentroDe = hoja.piezas.flatMap((p, i) => (esta(p) ? [i] : []));
  if (!dentroDe.length) return [];
  const trozos = hoja.piezas.slice(dentroDe[0], dentroDe[dentroDe.length - 1] + 1).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
  return juntarRenglones(trozos, Infinity);
}

/**
 * Un lápiz que encierra unos renglones, a mano: sigue su forma (en escalera si son varios), con
 * las esquinas redondeadas, y se pasa un poco al cerrar.
 */
function contorno(lineas: RectHoja[], h: Holgura, rnd: () => number): Punto[] {
  const j = () => (rnd() - 0.5) * 2.4;
  const L = lineas.map((r) => ({ x0: r.x - 6 + j(), x1: r.x + r.w + 6 + j(), y0: r.y - 4, y1: r.y + r.h + 4 }));
  L[0].y0 = lineas[0].y - h.arriba;
  L[L.length - 1].y1 = lineas[lineas.length - 1].y + lineas[lineas.length - 1].h + h.abajo;
  // Entre dos renglones, el lápiz pasa por la mitad.
  for (let i = 0; i + 1 < L.length; i++) L[i].y1 = L[i + 1].y0 = (L[i].y1 + L[i + 1].y0) / 2;
  const n = L.length;
  const pts: Punto[] = [[L[0].x0 + 10, L[0].y0 + j() * 0.4]];
  for (const l of L) pts.push([l.x1, l.y0], [l.x1, l.y1]);
  for (let i = n - 1; i >= 0; i--) pts.push([L[i].x0, L[i].y1], [L[i].x0, L[i].y0]);
  pts.push([L[0].x0 + 22 + rnd() * 14, L[0].y0 - 1.5 - rnd() * 1.5]);
  // Sin puntos repetidos, y con las esquinas redondeadas.
  const limpios = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
  const salida: Punto[] = [limpios[0]];
  for (let i = 1; i < limpios.length - 1; i++) {
    const [px, py] = limpios[i];
    for (const [qx, qy] of [limpios[i - 1], limpios[i + 1]]) {
      const d = Math.hypot(qx - px, qy - py);
      const r = Math.min(9, d / 2) / d;
      salida.push([px + (qx - px) * r, py + (qy - py) * r]);
    }
  }
  salida.push(limpios[limpios.length - 1]);
  return salida;
}

type Holgura = { arriba: number; abajo: number };

/** Cuánto aire dejar arriba y abajo de unos renglones: hasta la mitad del blanco con los vecinos. */
function holgura(hoja: Hoja, lineas: RectHoja[]): Holgura {
  const y0 = Math.min(...lineas.map((r) => r.y));
  const y1 = Math.max(...lineas.map((r) => r.y + r.h));
  const arriba = hoja.piezas.filter((p) => p.y + p.h / 2 < y0).map((p) => p.y + p.h);
  const abajo = hoja.piezas.filter((p) => p.y + p.h / 2 > y1).map((p) => p.y);
  const medio = (blanco: number) => Math.max(1.5, Math.min(7, blanco / 2));
  return { arriba: medio(arriba.length ? y0 - Math.max(...arriba) : 14), abajo: medio(abajo.length ? Math.min(...abajo) - y1 : 14) };
}

/** Los renglones nuevos de unos rectángulos de la página original (uno por renglón, de una selección). */
function lineasDeSeleccion(hoja: Hoja, rects: [number, number, number, number][]): RectHoja[] {
  const trozos = rects.flatMap(([x, y, w, h]) => lineasEnHoja(hoja, { x0: x, y0: y, x1: x + w, y1: y + h }));
  return juntarRenglones(trozos, Infinity);
}

/**
 * Las marcas de la página, sobre una hoja ya acomodada (el lienzo con «multiply»). Cada una va
 * alrededor de sus palabras, donde hayan quedado: el resaltador sobre ellas, el lápiz que encierra
 * y el recuadro alrededor, la raya roja del marcador debajo.
 */
function dibujarMarcas(ctx: CanvasRenderingContext2D, hoja: Hoja, d: Disposicion, o: OpcionesMedida, frases: Frase[], marcador?: MarcaLectura | null) {
  const u = { x: 0, y: 0, escala: 1, dpr: o.dpr };
  for (const f of frases) {
    if (f.tipo === 'resaltado' && !esLapiz(f.color)) {
      if (!f.rects?.length) continue; // a mano, en una página escaneada: va dibujado en la página
      const rects = f.rects.flatMap(([x, y, w, h]) => lineasEnHoja(hoja, { x0: x, y0: y, x1: x + w, y1: y + h }));
      if (rects.length) dibujarFrase(ctx, { ...f, rects: rects.map((r) => [r.x, r.y - 1, r.w, r.h + 3]) }, u);
    } else if (f.tipo === 'recuadro') {
      const c = f.caja;
      if (!c) continue;
      // Las mismas palabras que se guardaron; en una página escaneada, las que caen adentro.
      const sel = d.texto?.tieneTexto ? enRecuadro(d.texto, c) : null;
      const lineas = sel
        ? lineasDeSeleccion(hoja, sel.rects)
        : lineasDentro(hoja, (p) => {
            const [x, y] = [p.sx + p.sw / 2, p.sy + p.sh / 2];
            return x >= c[0] && x <= c[0] + c[2] && y >= c[1] && y <= c[1] + c[3];
          });
      if (!lineas.length) continue;
      const h = holgura(hoja, lineas);
      const x0 = Math.min(...lineas.map((r) => r.x)) - 8;
      const y0 = Math.min(...lineas.map((r) => r.y)) - h.arriba;
      const x1 = Math.max(...lineas.map((r) => r.x + r.w)) + 8;
      const y1 = Math.max(...lineas.map((r) => r.y + r.h)) + h.abajo;
      dibujarFrase(ctx, { ...f, caja: [x0, y0, x1 - x0, y1 - y0] }, u);
    } else if (f.trazo && f.trazo.length > 2) {
      // Las mismas palabras que se guardaron. En una página escaneada, las que quedan dentro de
      // verdad (si el lápiz corta un renglón vecino, ese no entra) o, si no hay, las del centro.
      const t = f.trazo;
      const sel = d.texto?.tieneTexto ? encerradas(d.texto, t) : null;
      const estricto = (p: Pieza) => dentro(p.sx + p.sw / 2, p.sy + p.sh * 0.3, t) && dentro(p.sx + p.sw / 2, p.sy + p.sh * 0.7, t);
      const alCentro = (p: Pieza) => dentro(p.sx + p.sw / 2, p.sy + p.sh / 2, t);
      const lineas = sel ? lineasDeSeleccion(hoja, sel.rects) : lineasDentro(hoja, d.hojas.some((h) => h.piezas.some(estricto)) ? estricto : alCentro);
      if (!lineas.length) continue;
      const rnd = azar(f.id);
      trazoLapiz(ctx, contorno(lineas, holgura(hoja, lineas), rnd), esLapiz(f.color) ? LAPICES[f.color].hex : LAPICES.grafito.hex, u, rnd);
    }
  }
  if (marcador) {
    // La raya roja, debajo de cada trozo de la línea marcada.
    const r = { x0: marcador.x0 * d.ancho, y0: marcador.y0 * d.alto, x1: marcador.x1 * d.ancho, y1: marcador.y1 * d.alto };
    const W = o.ancho;
    const H = o.alto;
    for (const l of lineasEnHoja(hoja, r))
      dibujarMarcaLectura(ctx, { ...marcador, x0: l.x / W, x1: (l.x + l.w) / W, y0: l.y / H, y1: (l.y + l.h) / H }, 0, 0, W * o.dpr, H * o.dpr, o.dpr);
  }
}

/** En qué hoja de la página queda un rectángulo de la página original (-1 si en ninguna). */
export function parteDe(d: Disposicion, r: Rect): number {
  return d.hojas.findIndex((h) => rectsEnHoja(h, r).length > 0);
}

/** Un punto de la hoja (px CSS) en la página original (unidades): la palabra tocada, o la más cercana. */
export function aOriginal(hoja: Hoja, x: number, y: number): { u: number; v: number } | null {
  let mejor: Pieza | null = null;
  let dMin = Infinity;
  for (const p of hoja.piezas) {
    const dx = Math.max(p.x - x, 0, x - (p.x + p.w));
    const dy = Math.max(p.y - y, 0, y - (p.y + p.h));
    const d = Math.hypot(dx, dy * 2);
    if (d < dMin) [mejor, dMin] = [p, d];
  }
  if (!mejor || dMin > 40) return null;
  const tx = Math.max(0, Math.min(1, (x - mejor.x) / mejor.w));
  const ty = Math.max(0, Math.min(1, (y - mejor.y) / mejor.h));
  return { u: mejor.sx + tx * mejor.sw, v: mejor.sy + ty * mejor.sh };
}

export class HojasMedida {
  private disposiciones = new Map<number, Disposicion>();
  private enCamino = new Map<number, Promise<Disposicion | null>>();
  /** Páginas dibujadas grandes, de donde se recortan las palabras (pocas: pesan). */
  private fuentes = new Map<number, { lienzo: HTMLCanvasElement; k: number; version: number }>();
  private listas = new Map<number, { lienzo: HTMLCanvasElement; version: number }>();
  private deseadas: number[] = [];
  private paginasDeseadas: number[] = [];
  private version = 1;
  private versionMarcas = new Map<number, number>();
  private trabajando = false;
  /** Algo cambió (lo pedido, las marcas, la medida) mientras se trabajaba: hay que volver a mirar. */
  private cambio = false;
  private cerrado = false;
  onLista?: (k: number, lienzo: HTMLCanvasElement) => void;
  onSoltada?: (k: number) => void;
  /** Se supo cuántas hojas tiene una página. */
  onDisposicion?: (pagina: number, d: Disposicion) => void;

  constructor(
    private doc: DocumentoPdf,
    private o: OpcionesMedida,
    /** Las marcas de una página (para dibujarlas con sus palabras). */
    private marcas: (pagina: number) => { frases: Frase[]; marcador?: MarcaLectura | null },
  ) {}

  get opciones() {
    return this.o;
  }

  cambiarDocumento(doc: DocumentoPdf) {
    this.doc = doc;
  }

  /** Otro tamaño de hoja o de letra: todo se vuelve a acomodar. */
  configurar(o: OpcionesMedida) {
    if (JSON.stringify(o) === JSON.stringify(this.o)) return;
    this.o = o;
    this.version++;
    this.cambio = true;
    this.disposiciones.clear();
    this.enCamino.clear();
    this.fuentes.clear();
    for (const k of [...this.listas.keys()]) {
      this.listas.delete(k);
      this.onSoltada?.(k);
    }
  }

  /** Cuántas hojas tiene la página (si ya se sabe). */
  partes(pagina: number) {
    return this.disposiciones.get(pagina)?.hojas.length;
  }

  disposicion(pagina: number) {
    return this.disposiciones.get(pagina);
  }

  obtener(k: number) {
    return this.listas.get(k)?.lienzo;
  }

  /** Las marcas de una página cambiaron: sus hojas se vuelven a dibujar. */
  marcasCambiaron(pagina: number) {
    this.versionMarcas.set(pagina, (this.versionMarcas.get(pagina) ?? 0) + 1);
    this.fuentes.delete(pagina);
    this.cambio = true;
    void this.trabajar();
  }

  /**
   * Las hojas que hacen falta (en orden de prioridad); las demás se sueltan. `paginas`: las que
   * conviene tener acomodadas (para saber cuántas hojas tienen, por ejemplo al volver atrás).
   */
  pedir(claves: number[], paginas: number[] = []) {
    this.deseadas = claves;
    this.paginasDeseadas = paginas;
    this.cambio = true;
    for (const k of [...this.listas.keys()])
      if (!claves.includes(k)) {
        this.listas.delete(k);
        this.onSoltada?.(k);
      }
    void this.trabajar();
  }

  /** Acomoda una página (si no está ya acomodada). */
  acomodar(pagina: number): Promise<Disposicion | null> {
    const ya = this.disposiciones.get(pagina);
    if (ya) return Promise.resolve(ya);
    let p = this.enCamino.get(pagina);
    if (!p) {
      const version = this.version;
      p = this.calcular(pagina).then((d) => {
        if (d && version === this.version && !this.cerrado) {
          this.disposiciones.set(pagina, d);
          // Solo se recuerdan unas cuantas (pesan poco, pero un libro puede ser enorme).
          if (this.disposiciones.size > 40) this.disposiciones.delete(this.disposiciones.keys().next().value!);
          this.onDisposicion?.(pagina, d);
        }
        this.enCamino.delete(pagina);
        return version === this.version ? d : null;
      });
      this.enCamino.set(pagina, p);
    }
    return p;
  }

  destruir() {
    this.cerrado = true;
    this.listas.clear();
    this.fuentes.clear();
  }

  private async calcular(pagina: number): Promise<Disposicion | null> {
    try {
      const pag = await this.doc.getPage(pagina + 1);
      const base = pag.getViewport({ scale: 1 });
      // La página en grises, para buscar renglones y palabras.
      const vista = pag.getViewport({ scale: K_BUSCAR });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vista.width);
      c.height = Math.ceil(vista.height);
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await pag.render({ canvas: c, viewport: vista }).promise;
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      const gris = new Uint8Array(c.width * c.height);
      for (let i = 0; i < gris.length; i++) gris[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 151 + px[i * 4 + 2] * 28) >> 8;
      c.width = c.height = 0;
      const renglones = renglonesDeImagen(gris, Math.ceil(vista.width), Math.ceil(vista.height), K_BUSCAR);
      let texto: TextoPagina | null = null;
      try {
        texto = await leerTextoPagina(pag);
        marcarGuiones(renglones, texto);
      } catch {
        /* sin capa de texto: las palabras cortadas quedan con su guion */
      }
      pag.cleanup();
      const o = this.o;
      const opciones = { ancho: o.ancho, alto: o.alto, margenX: Math.round(o.ancho * 0.06), margenArriba: 52, margenAbajo: 46, letra: o.letra };
      const { hojas, escala } = maquetar(parrafosDe(sinMargenes(renglones)), opciones);
      if (hojas.length) return { hojas, escala, ancho: base.width, alto: base.height, texto };
      // Sin renglones (una página en blanco o una lámina): la página entera, al ancho.
      const e = Math.min((o.ancho - 2 * opciones.margenX) / base.width, (o.alto - opciones.margenArriba - opciones.margenAbajo) / base.height);
      const w = base.width * e;
      const h = base.height * e;
      const pieza = { sx: 0, sy: 0, sw: base.width, sh: base.height, x: (o.ancho - w) / 2, y: (o.alto - h) / 2, w, h };
      return { hojas: [{ piezas: [pieza] }], escala: e, ancho: base.width, alto: base.height };
    } catch (e) {
      if ((e as { name?: string })?.name !== 'RenderingCancelledException') console.error(`No se pudo acomodar la página ${pagina + 1}`, e);
      return null;
    }
  }

  /** La página dibujada grande, con sus marcas, para recortar las palabras. */
  private async fuente(pagina: number, d: Disposicion) {
    const vm = this.versionMarcas.get(pagina) ?? 0;
    const ya = this.fuentes.get(pagina);
    if (ya && ya.version === vm) return ya;
    const pag = await this.doc.getPage(pagina + 1);
    const k = Math.min(d.escala * this.o.dpr, Math.sqrt(MAX_FUENTE / (d.ancho * d.alto)));
    const vista = pag.getViewport({ scale: k });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.ceil(vista.width);
    lienzo.height = Math.ceil(vista.height);
    const ctx = lienzo.getContext('2d', { alpha: false })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pag.render({ canvas: lienzo, viewport: vista }).promise;
    pag.cleanup();
    // El resaltado a mano de una página escaneada va sobre la página (no tiene palabras que seguir).
    const aMano = this.marcas(pagina).frases.filter((f) => f.tipo === 'resaltado' && !esLapiz(f.color) && !f.rects?.length && f.trazo);
    if (aMano.length) {
      ctx.globalCompositeOperation = 'multiply';
      for (const f of aMano) dibujarFrase(ctx, f, { x: 0, y: 0, escala: 1, dpr: k });
      ctx.globalCompositeOperation = 'source-over';
    }
    const f = { lienzo, k, version: vm };
    this.fuentes.set(pagina, f);
    while (this.fuentes.size > 2) this.fuentes.delete(this.fuentes.keys().next().value!);
    return f;
  }

  /** Dibuja una hoja: el papel blanco, las palabras recortadas, el título arriba y el número abajo. */
  private async dibujar(pagina: number, parte: number, d: Disposicion) {
    const f = await this.fuente(pagina, d);
    const o = this.o;
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(o.ancho * o.dpr);
    lienzo.height = Math.round(o.alto * o.dpr);
    const ctx = lienzo.getContext('2d', { alpha: false })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.imageSmoothingQuality = 'high';
    dibujarHoja(ctx, d.hojas[parte], f.lienzo, f.k, o.dpr);
    const { frases, marcador } = this.marcas(pagina);
    if (frases.length || marcador) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      dibujarMarcas(ctx, d.hojas[parte], d, o, frases, marcador);
      ctx.restore();
    }
    ctx.save();
    ctx.scale(o.dpr, o.dpr);
    ctx.fillStyle = TINTA_TENUE;
    ctx.textAlign = 'center';
    ctx.font = '600 9.5px Fraunces, Georgia, serif';
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '2.2px';
    const titulo = o.titulo.toUpperCase();
    ctx.fillText(titulo.length > 42 ? `${titulo.slice(0, 40)}…` : titulo, o.ancho / 2, 30);
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
    ctx.font = '400 12px Fraunces, Georgia, serif';
    const n = d.hojas.length;
    ctx.fillText(n > 1 ? `${pagina + 1} · ${parte + 1} de ${n}` : String(pagina + 1), o.ancho / 2, o.alto - 20);
    ctx.restore();
    return lienzo;
  }

  private async trabajar() {
    if (this.trabajando || this.cerrado) return;
    this.trabajando = true;
    try {
      for (;;) {
        this.cambio = false;
        // La primera hoja deseada que falta (o que quedó vieja).
        let hecho = false;
        for (const k of this.deseadas) {
          const pagina = Math.floor((k - BASE_CLAVE) / POR_PAGINA);
          const parte = (k - BASE_CLAVE) % POR_PAGINA;
          const version = this.version * 1000 + (this.versionMarcas.get(pagina) ?? 0);
          if (this.listas.get(k)?.version === version) continue;
          const d = await this.acomodar(pagina);
          if (this.cerrado) return;
          if (!d || parte >= d.hojas.length || !this.deseadas.includes(k)) continue;
          const lienzo = await this.dibujar(pagina, parte, d);
          if (this.cerrado) return;
          if (!this.deseadas.includes(k) || version !== this.version * 1000 + (this.versionMarcas.get(pagina) ?? 0)) {
            hecho = true;
            break;
          }
          this.listas.set(k, { lienzo, version });
          this.onLista?.(k, lienzo);
          hecho = true;
          break;
        }
        if (!hecho && !this.cambio) {
          // Ya están las hojas: se acomodan las páginas vecinas (sin dibujarlas).
          const falta = this.paginasDeseadas.find((p) => !this.disposiciones.has(p));
          if (falta === undefined) break;
          await this.acomodar(falta);
          if (this.cerrado) return;
          if (!this.disposiciones.has(falta)) this.paginasDeseadas = this.paginasDeseadas.filter((p) => p !== falta);
        }
        await new Promise((ok) => setTimeout(ok, 0));
      }
    } finally {
      this.trabajando = false;
    }
  }
}
