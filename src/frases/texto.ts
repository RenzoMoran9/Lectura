// Geometría del texto de una página, a partir de la capa de texto de PDF.js: dónde está cada letra
// (en unidades de la página: puntos PDF, origen arriba a la izquierda). Con eso se resalta por
// palabras, se sabe qué quedó dentro de un círculo a lápiz y se arma el texto de la frase.

import type { Punto, Rect } from './modelo';

export interface Letra {
  c: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  linea: number;
  /** Separador añadido (salto de renglón o espacio entre trozos): no se toca ni se resalta. */
  virtual?: boolean;
}

export interface TextoPagina {
  letras: Letra[];
  tieneTexto: boolean;
}

/** Lo mínimo que necesitamos de un elemento de `getTextContent()`. */
export interface TrozoTexto {
  str: string;
  transform: number[];
  width: number;
  fontName: string;
  hasEOL?: boolean;
}

export interface EstiloTexto {
  fontFamily?: string;
  ascent?: number;
  descent?: number;
  vertical?: boolean;
}

/** Multiplica dos matrices afines de PDF [a b c d e f]. */
export function componer(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

const esEspacio = (c: string) => /\s/.test(c);

/**
 * Arma la lista de letras con su caja. `medir` da el ancho de un texto con una fuente dada; solo
 * importa la proporción entre letras, porque cada trozo se ajusta al ancho que dice el PDF.
 */
export function construirTexto(
  trozos: TrozoTexto[],
  estilos: Record<string, EstiloTexto>,
  transformVista: number[],
  medir: (texto: string, fuente: string) => number,
): TextoPagina {
  const letras: Letra[] = [];
  let linea = 0;
  let prev: { base: number; alto: number; x1: number; eol: boolean } | null = null;

  for (const t of trozos) {
    if (typeof t.str !== 'string') continue;
    const tx = componer(transformVista, t.transform);
    const angulo = Math.atan2(tx[1], tx[0]);
    const estilo = estilos[t.fontName] ?? {};
    // Texto girado o vertical: por ahora no se marca.
    if (Math.abs(angulo) > 0.02 || estilo.vertical) {
      if (t.hasEOL && prev) prev.eol = true;
      continue;
    }
    const alto = Math.hypot(tx[2], tx[3]);
    if (!t.str.length || alto <= 0) {
      if (t.hasEOL && prev) prev.eol = true;
      continue;
    }
    const base = tx[5];
    const x = tx[4];
    const ancho = Math.abs(t.width * (Math.hypot(transformVista[0], transformVista[1]) || 1));
    const nuevoRenglon = !prev || prev.eol || Math.abs(base - prev.base) > Math.max(prev.alto, alto) * 0.5 || x < prev.x1 - alto;
    if (prev) {
      if (nuevoRenglon) {
        linea++;
        letras.push({ c: '\n', x0: x, x1: x, top: base - alto, bottom: base, linea, virtual: true });
      } else if (x - prev.x1 > alto * 0.2 && !esEspacio(letras[letras.length - 1]?.c ?? ' ') && !esEspacio(t.str[0])) {
        letras.push({ c: ' ', x0: prev.x1, x1: x, top: base - alto, bottom: base, linea, virtual: true });
      }
    }
    const asc = estilo.ascent && estilo.ascent > 0.3 ? estilo.ascent : 0.8;
    const desc = estilo.descent && estilo.descent < 0 ? -estilo.descent : 0.2;
    const top = base - asc * alto;
    const bottom = base + desc * alto;
    const fuente = `${Math.max(1, alto)}px ${estilo.fontFamily || 'serif'}`;
    const chars = [...t.str];
    const medidas = chars.map((c) => Math.max(0.0001, medir(c, fuente)));
    const suma = medidas.reduce((a, b) => a + b, 0);
    const escala = ancho > 0 ? ancho / suma : alto * 0.5 / (suma / chars.length);
    let cx = x;
    chars.forEach((c, i) => {
      const w = medidas[i] * escala;
      letras.push({ c, x0: cx, x1: cx + w, top, bottom, linea });
      cx += w;
    });
    prev = { base, alto, x1: cx, eol: !!t.hasEOL };
  }
  const reales = letras.filter((l) => !l.virtual && !esEspacio(l.c)).length;
  return { letras, tieneTexto: reales >= 8 };
}

/** Letra más cercana a (u, v), si está a menos de `radio`. */
export function letraEn(t: TextoPagina, u: number, v: number, radio: number): number {
  let mejor = -1;
  let dMin = radio;
  t.letras.forEach((l, i) => {
    if (l.virtual) return;
    const dx = Math.max(l.x0 - u, 0, u - l.x1);
    const dy = Math.max(l.top - v, 0, v - l.bottom);
    const d = Math.hypot(dx, dy * 1.3);
    if (d < dMin || (d === dMin && mejor >= 0 && esEspacio(t.letras[mejor].c) && !esEspacio(l.c))) {
      dMin = d;
      mejor = i;
    }
  });
  return mejor;
}

const esParteDePalabra = (l: Letra | undefined) => !!l && !l.virtual && !esEspacio(l.c);

export interface Seleccion {
  desde: number;
  hasta: number;
  rects: Rect[];
  texto: string;
}

/** Selección entre dos letras (en cualquier orden), ajustada a palabras completas. */
export function seleccionar(t: TextoPagina, a: number, b: number): Seleccion | null {
  if (a < 0 || b < 0) return null;
  let i = Math.min(a, b);
  let j = Math.max(a, b);
  const L = t.letras;
  // Sin empezar ni terminar en blanco.
  while (i <= j && !esParteDePalabra(L[i])) i++;
  while (j >= i && !esParteDePalabra(L[j])) j--;
  if (i > j) return null;
  while (esParteDePalabra(L[i - 1]) && L[i - 1].linea === L[i].linea) i--;
  while (esParteDePalabra(L[j + 1]) && L[j + 1].linea === L[j].linea) j++;
  // Si la palabra termina en signo de puntuación pegado, entra también.
  return { desde: i, hasta: j, rects: rectangulos(t, i, j), texto: textoEntre(t, i, j) };
}

/** Un rectángulo por renglón, sin los blancos de las puntas. */
export function rectangulos(t: TextoPagina, i: number, j: number): Rect[] {
  const rects: Rect[] = [];
  let actual: { linea: number; x0: number; x1: number; top: number; bottom: number } | null = null;
  const cerrar = () => {
    if (actual) rects.push([actual.x0, actual.top, actual.x1 - actual.x0, actual.bottom - actual.top]);
    actual = null;
  };
  for (let k = i; k <= j; k++) {
    const l = t.letras[k];
    if (l.virtual) continue;
    if (actual && l.linea !== actual.linea) cerrar();
    if (esEspacio(l.c)) continue;
    if (!actual) actual = { linea: l.linea, x0: l.x0, x1: l.x1, top: l.top, bottom: l.bottom };
    else {
      actual.x0 = Math.min(actual.x0, l.x0);
      actual.x1 = Math.max(actual.x1, l.x1);
      actual.top = Math.min(actual.top, l.top);
      actual.bottom = Math.max(actual.bottom, l.bottom);
    }
  }
  cerrar();
  return rects;
}

/** El texto entre dos letras: une renglones y quita el guion de las palabras cortadas. */
export function textoEntre(t: TextoPagina, i: number, j: number): string {
  let s = '';
  for (let k = i; k <= j; k++) {
    const l = t.letras[k];
    if (l.c === '\n') {
      const antes = s.at(-1) ?? '';
      const despues = t.letras[k + 1]?.c ?? '';
      if (/[-‐­]/.test(antes) && /\p{Ll}/u.test(despues)) s = s.slice(0, -1);
      else s += ' ';
      continue;
    }
    s += l.c === '­' ? '' : l.c;
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** ¿Está el punto dentro del polígono? (regla par-impar) */
export function dentro(p: Punto, poligono: Punto[]): boolean {
  let adentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) adentro = !adentro;
  }
  return adentro;
}

/** Palabras que quedaron dentro de un trazo a lápiz (cerrado imaginariamente del final al inicio). */
export function encerradas(t: TextoPagina, trazo: Punto[]): Seleccion | null {
  if (trazo.length < 3) return null;
  // Primero, solo letras que quedan dentro de verdad (arriba y abajo de su centro): si el trazo
  // corta un renglón vecino, ese renglón no entra. Si así no queda nada, basta con el centro.
  const buscar = (estricto: boolean) => {
    let a = -1;
    let b = -1;
    t.letras.forEach((l, k) => {
      if (!esParteDePalabra(l)) return;
      const cx = (l.x0 + l.x1) / 2;
      const alto = l.bottom - l.top;
      const puntos: Punto[] = estricto
        ? [
            [cx, l.top + alto * 0.3],
            [cx, l.bottom - alto * 0.3],
          ]
        : [[cx, (l.top + l.bottom) / 2]];
      if (puntos.every((p) => dentro(p, trazo))) {
        if (a < 0) a = k;
        b = k;
      }
    });
    return a < 0 ? null : seleccionar(t, a, b);
  };
  return buscar(true) ?? buscar(false);
}

/** Lee la capa de texto de una página de PDF.js. */
export async function leerTextoPagina(pagina: {
  getViewport: (o: { scale: number }) => { transform: number[] };
  getTextContent: () => Promise<{ items: unknown[]; styles: Record<string, EstiloTexto> }>;
}): Promise<TextoPagina> {
  const vista = pagina.getViewport({ scale: 1 });
  const contenido = await pagina.getTextContent();
  const ctx = document.createElement('canvas').getContext('2d')!;
  const medir = (texto: string, fuente: string) => {
    if (ctx.font !== fuente) ctx.font = fuente;
    return ctx.measureText(texto).width;
  };
  const trozos = (contenido.items as TrozoTexto[]).filter((x) => typeof x.str === 'string');
  return construirTexto(trozos, contenido.styles, vista.transform, medir);
}
