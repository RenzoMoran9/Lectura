// Dónde me quedé: el marcador que dejo con el dedo sobre una línea, el ritmo con que leo (para
// saber cuánto falta) y los límites del capítulo en el que voy.

import { azar } from '../frases/dibujo';
import type { TextoPagina } from '../frases/texto';
import type { Capitulo } from '../pdf/indice';

/** El marcador de lectura: una línea de una página (en fracciones de la página, desde arriba a la izquierda). */
export interface MarcaLectura {
  pagina: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** El comienzo de la línea desde la palabra marcada, para recordarla en el estante. */
  texto?: string;
  creado: number;
}

const blanco = (c: string) => /\s/.test(c);

/**
 * La línea que está bajo el dedo: desde la palabra tocada hasta el final del renglón. `u` y `v`
 * van en unidades de la página (puntos PDF), y la página mide `ancho` × `alto`.
 */
export function marcaDesdeTexto(t: TextoPagina, i: number, ancho: number, alto: number, pagina: number): MarcaLectura | null {
  const letras = t.letras;
  const l = letras[i];
  if (!l) return null;
  // Comienzo de la palabra.
  let a = i;
  while (a > 0 && !letras[a - 1].virtual && !blanco(letras[a - 1].c) && letras[a - 1].linea === l.linea) a--;
  const renglon = letras.filter((k) => k.linea === l.linea && !k.virtual);
  const x1 = Math.max(...renglon.map((k) => k.x1));
  const y0 = Math.min(...renglon.map((k) => k.top));
  const y1 = Math.max(...renglon.map((k) => k.bottom));
  // Unas cuantas palabras desde ahí (pueden seguir en el renglón siguiente).
  let texto = '';
  for (let k = a; k < letras.length && texto.length < 70; k++) texto += letras[k].virtual ? ' ' : letras[k].c;
  texto = texto.replace(/-\s+(?=\p{L})/gu, '').replace(/\s+/g, ' ').trim();
  const corte = texto.length >= 70 ? texto.lastIndexOf(' ') : -1;
  if (corte > 30) texto = texto.slice(0, corte);
  return { pagina, x0: letras[a].x0 / ancho, x1: x1 / ancho, y0: y0 / alto, y1: y1 / alto, texto: texto || undefined, creado: Date.now() };
}

/** Sin capa de texto (páginas escaneadas): una línea a la altura del dedo, hasta el borde del texto. */
export function marcaSinTexto(u: number, v: number, derecha: number, pagina: number): MarcaLectura {
  const medio = 0.009;
  return { pagina, x0: u, x1: Math.max(u + 0.05, derecha), y0: v - medio, y1: v + medio, creado: Date.now() };
}

/** ¿El dedo cae sobre la línea marcada? (para quitar el marcador). */
export function tocaMarca(m: MarcaLectura, u: number, v: number) {
  const alto = m.y1 - m.y0;
  return v > m.y0 - alto && v < m.y1 + alto && u > m.x0 - 0.1 && u < m.x1 + 0.05;
}

/**
 * La raya de lápiz rojo bajo la línea marcada, sobre el lienzo de marcas de la página (en px del
 * lienzo: la página empieza en `x`,`y` y mide `w` × `h`).
 */
export function dibujarMarcaLectura(ctx: CanvasRenderingContext2D, m: MarcaLectura, x: number, y: number, w: number, h: number, px: number) {
  const rnd = azar(`marcador-${m.creado}`);
  const x0 = x + m.x0 * w - 1.5 * px;
  const x1 = x + m.x1 * w + 2 * px;
  const base = y + m.y1 * h + 1.6 * px;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [ancho, alfa, desvio] of [
    [1.5, 0.85, 0],
    [0.8, 0.35, 0.7],
  ] as const) {
    ctx.strokeStyle = `rgba(179, 54, 43, ${alfa})`;
    ctx.lineWidth = ancho * px;
    ctx.beginPath();
    const pasos = Math.max(3, Math.round((x1 - x0) / (18 * px)));
    let yy = base + desvio * px + (rnd() - 0.5) * px;
    ctx.moveTo(x0, yy);
    for (let k = 1; k <= pasos; k++) {
      const xx = x0 + ((x1 - x0) * k) / pasos;
      const siguiente = base + desvio * px + (rnd() - 0.5) * 1.6 * px - (k / pasos) * 0.8 * px;
      ctx.quadraticCurveTo(xx - (x1 - x0) / pasos / 2, (yy + siguiente) / 2 + (rnd() - 0.5) * px, xx, siguiente);
      yy = siguiente;
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- Ritmo de lectura y cuánto falta ----------

export interface Ritmo {
  /** Segundos por página (promedio móvil). */
  seg: number;
  /** Cuántas páginas se midieron. */
  n: number;
}

/** Suma una página leída en `seg` segundos. Se ignoran los saltos rápidos y las pausas largas. */
export function sumarAlRitmo(r: Ritmo | undefined, seg: number): Ritmo | undefined {
  if (seg < 4 || seg > 600) return r;
  if (!r || !r.n) return { seg, n: 1 };
  const peso = Math.max(0.1, 1 / (r.n + 1));
  return { seg: r.seg * (1 - peso) + seg * peso, n: r.n + 1 };
}

/** Un ritmo con pocas páginas medidas todavía no sirve para calcular. */
export const ritmoConfiable = (r: Ritmo | undefined, minimo = 4): r is Ritmo => !!r && r.n >= minimo;

export function tiempoLegible(seg: number): string {
  const min = Math.round(seg / 60);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** El capítulo en el que va la página, dónde empieza y dónde empieza el siguiente. */
export function limitesCapitulo(caps: Capitulo[], pagina: number, total: number) {
  let i = -1;
  for (let k = 0; k < caps.length; k++) if (caps[k].pagina <= pagina) i = k;
  if (i < 0) return null;
  let fin = total;
  for (let k = i + 1; k < caps.length; k++)
    if (caps[k].pagina > caps[i].pagina) {
      fin = caps[k].pagina;
      break;
    }
  return { indice: i, capitulo: caps[i], inicio: caps[i].pagina, fin };
}

/** Lo que falta para terminar el capítulo y el libro (en segundos), o null si no se sabe aún. */
export function falta(r: Ritmo | undefined, caps: Capitulo[], pagina: number, total: number) {
  if (!ritmoConfiable(r)) return null;
  const cap = limitesCapitulo(caps, pagina, total);
  const libro = Math.max(0, total - pagina - 0.5) * r.seg;
  // En el último capítulo, terminarlo es terminar el libro: se dice una sola vez.
  const capitulo = cap && cap.fin < total ? Math.max(0, cap.fin - pagina - 0.5) * r.seg : null;
  return { libro, capitulo };
}
