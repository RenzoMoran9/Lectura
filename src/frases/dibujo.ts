// Cómo se ven las marcas: resaltador con bordes irregulares de marcador, lápiz con temblor y el
// cuadro a lápiz del recuadro.
// Se dibujan en un lienzo blanco con «multiply», que luego se multiplica con la página en WebGL
// (y también sirven para la vista previa mientras el dedo marca).

import { esLapiz, LAPICES, RESALTADORES, type ColorMarca, type Frase, type Punto, type Rect } from './modelo';

/** De unidades de la página a píxeles del lienzo: (x + u·escala)·dpr. */
export interface Ubicacion {
  x: number;
  y: number;
  escala: number;
  dpr: number;
}

/** Azar con semilla: la misma marca se dibuja siempre igual. */
export function azar(semilla: number | string) {
  let s = typeof semilla === 'number' ? semilla : [...semilla].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgba = ([r, g, b]: number[], a: number) => `rgba(${r},${g},${b},${a})`;
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Un trazo de resaltador sobre un renglón (rect en unidades de la página). */
function trazoResaltador(ctx: CanvasRenderingContext2D, rect: Rect, rgb: number[], u: Ubicacion, rnd: () => number) {
  const px = u.dpr; // un píxel CSS
  const [rx, ry, rw, rh] = rect;
  const x0 = (u.x + rx * u.escala) * u.dpr - 2.5 * px;
  const x1 = (u.x + (rx + rw) * u.escala) * u.dpr + 2.5 * px;
  const y0 = (u.y + (ry + rh * 0.1) * u.escala) * u.dpr;
  const y1 = (u.y + (ry + rh * 0.97) * u.escala) * u.dpr;
  const alto = y1 - y0;
  const temblor = () => (rnd() - 0.5) * 1.4 * px;
  // Contorno: bordes arriba y abajo algo ondulados, puntas redondeadas e inclinadas.
  const pasos = Math.max(2, Math.round((x1 - x0) / (14 * px)));
  const inclin = (rnd() - 0.5) * 0.12 * alto;
  ctx.beginPath();
  ctx.moveTo(x0 + alto * 0.18, y0 + temblor());
  for (let i = 1; i <= pasos; i++) ctx.lineTo(x0 + alto * 0.18 + ((x1 - x0 - alto * 0.3) * i) / pasos, y0 + temblor() + (inclin * i) / pasos);
  ctx.quadraticCurveTo(x1 + alto * 0.08, y0 + alto * 0.5 + inclin, x1 - alto * 0.1, y1 + temblor() + inclin);
  for (let i = pasos - 1; i >= 0; i--) ctx.lineTo(x0 + alto * 0.12 + ((x1 - x0 - alto * 0.24) * i) / pasos, y1 + temblor() + (inclin * i) / pasos);
  ctx.quadraticCurveTo(x0 - alto * 0.1, y0 + alto * 0.55, x0 + alto * 0.18, y0);
  ctx.closePath();
  // Más tinta en las puntas, donde el marcador se apoya y se levanta.
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgba(rgb, 0.3));
  g.addColorStop(Math.min(0.2, (6 * px) / Math.max(1, x1 - x0)), rgba(rgb, 0.78));
  g.addColorStop(0.55, rgba(rgb, 0.62));
  g.addColorStop(Math.max(0.8, 1 - (6 * px) / Math.max(1, x1 - x0)), rgba(rgb, 0.76));
  g.addColorStop(1, rgba(rgb, 0.34));
  ctx.fillStyle = g;
  ctx.fill();
  // Vetas del marcador.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = rgba(rgb, 0.14);
  ctx.lineWidth = Math.max(1, alto * 0.08);
  for (let i = 0; i < 3; i++) {
    const yy = y0 + alto * (0.2 + 0.3 * i + (rnd() - 0.5) * 0.1);
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x1, yy + inclin);
    ctx.stroke();
  }
  ctx.restore();
}

/** Suaviza un trazo de puntos (curvas cuadráticas por los puntos medios). */
function caminoSuave(ctx: CanvasRenderingContext2D, pts: number[][]) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const ult = pts[pts.length - 1];
  ctx.lineTo(ult[0], ult[1]);
}

/** Trazo de lápiz: varias pasadas finas con temblor, como el grafito sobre el papel. */
export function trazoLapiz(ctx: CanvasRenderingContext2D, trazo: Punto[], hex: string, u: Ubicacion, rnd: () => number) {
  if (trazo.length < 2) return;
  const px = u.dpr;
  const base = trazo.map(([a, b]) => [(u.x + a * u.escala) * u.dpr, (u.y + b * u.escala) * u.dpr]);
  const rgb = hexRgb(hex);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pasadas: [number, number, number][] = [
    [1.7, 0.72, 0.35],
    [1.0, 0.45, 0.6],
    [0.7, 0.35, 0.8],
  ];
  for (const [ancho, alfa, temblor] of pasadas) {
    const pts = base.map(([x, y]) => [x + (rnd() - 0.5) * temblor * px, y + (rnd() - 0.5) * temblor * px]);
    ctx.beginPath();
    caminoSuave(ctx, pts);
    ctx.strokeStyle = rgba(rgb, alfa);
    ctx.lineWidth = ancho * px;
    ctx.stroke();
  }
}

/** Resaltado a mano (páginas escaneadas): una banda ancha a lo largo del dedo. */
function bandaResaltador(ctx: CanvasRenderingContext2D, trazo: Punto[], grosor: number, rgb: number[], u: Ubicacion) {
  if (trazo.length < 2) return;
  const pts = trazo.map(([a, b]) => [(u.x + a * u.escala) * u.dpr, (u.y + b * u.escala) * u.dpr]);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  caminoSuave(ctx, pts);
  ctx.strokeStyle = rgba(rgb, 0.62);
  ctx.lineWidth = grosor * u.escala * u.dpr;
  ctx.stroke();
}

/**
 * Los cuatro lados de un cuadro hecho a mano: cada uno es un trazo apenas curvo que se pasa un
 * poquito de las esquinas (como cuando uno encuadra un párrafo con lápiz). `px` es un píxel CSS.
 */
export function ladosCuadro(x0: number, y0: number, x1: number, y1: number, px: number, rnd: () => number): Punto[][] {
  const j = () => (rnd() - 0.5) * 1.6 * px;
  const pasa = () => (1.2 + rnd() * 3) * px;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  return [
    [[x0 - pasa(), y0 + j()], [mx, y0 + j() * 0.6], [x1 + pasa(), y0 + j()]],
    [[x1 + j(), y0 - pasa()], [x1 + j() * 0.6, my], [x1 + j(), y1 + pasa()]],
    [[x1 + pasa(), y1 + j()], [mx, y1 + j() * 0.6], [x0 - pasa(), y1 + j()]],
    [[x0 + j(), y1 + pasa()], [x0 + j() * 0.6, my], [x0 + j(), y0 - pasa()]],
  ];
}

/** El cuadro de un recuadro, a lápiz y completo. */
export function cuadroLapiz(ctx: CanvasRenderingContext2D, [x, y, w, h]: Rect, hex: string, u: Ubicacion, rnd: () => number) {
  for (const lado of ladosCuadro(x, y, x + w, y + h, 1 / u.escala, rnd)) trazoLapiz(ctx, lado, hex, u, rnd);
}

/** El mismo cuadro como camino SVG (para las tarjetas de Mis frases), en px. */
export function cuadroAMano(w: number, h: number, semilla: string): string {
  const rnd = azar(semilla);
  const r = (n: number) => Math.round(n * 10) / 10;
  return ladosCuadro(1.5, 1.5, w - 1.5, h - 1.5, 1, rnd)
    .map(([a, m, b]) => `M${r(a[0])} ${r(a[1])} Q${r(m[0])} ${r(m[1])} ${r(b[0])} ${r(b[1])}`)
    .join(' ');
}

/**
 * El recuadro mientras se arrastra o se ajusta: lo de afuera más oscuro, el borde y una asa en
 * cada esquina (para moverla).
 */
export function recuadroEnCurso(ctx: CanvasRenderingContext2D, caja: Rect, u: Ubicacion, renglones: number | undefined, oscuro: boolean) {
  const [cx, cy, cw, ch] = caja;
  const x0 = (u.x + cx * u.escala) * u.dpr;
  const y0 = (u.y + cy * u.escala) * u.dpr;
  const x1 = (u.x + (cx + cw) * u.escala) * u.dpr;
  const y1 = (u.y + (cy + ch) * u.escala) * u.dpr;
  const px = u.dpr;
  const { width: W, height: H } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = oscuro ? 'rgba(0,0,0,.5)' : 'rgba(58,46,34,.34)';
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.fill('evenodd');
  ctx.strokeStyle = oscuro ? 'rgba(214,204,186,.9)' : '#2A2520';
  ctx.lineWidth = 1.5 * px;
  ctx.setLineDash([5 * px, 4 * px]);
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.setLineDash([]);
  for (const [ax, ay] of [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]) {
    ctx.beginPath();
    ctx.arc(ax, ay, 6.5 * px, 0, Math.PI * 2);
    ctx.fillStyle = oscuro ? '#23201C' : '#FBF7EF';
    ctx.fill();
    ctx.lineWidth = 2 * px;
    ctx.stroke();
  }
  if (renglones) {
    // Cuántos renglones van quedando dentro, sobre la esquina de arriba.
    const texto = renglones === 1 ? '1 renglón' : `${renglones} renglones`;
    ctx.font = `600 ${11.5 * px}px "DM Sans", sans-serif`;
    const tw = ctx.measureText(texto).width;
    const bw = tw + 18 * px;
    const bh = 22 * px;
    const bx = Math.max(4 * px, Math.min(W - bw - 4 * px, x0));
    const by = y0 - bh - 8 * px >= 2 * px ? y0 - bh - 8 * px : y1 + 8 * px;
    ctx.fillStyle = oscuro ? '#D6CCBA' : '#2A2520';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10 * px);
    ctx.fill();
    ctx.fillStyle = oscuro ? '#23201C' : '#F5EDDB';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, bx + 9 * px, by + bh / 2 + 0.5 * px);
  }
  ctx.restore();
}

/** Dibuja una frase (sobre un lienzo que ya tiene «multiply» y fondo blanco). */
export function dibujarFrase(
  ctx: CanvasRenderingContext2D,
  f: Pick<Frase, 'id' | 'color' | 'rects' | 'trazo' | 'grosor' | 'tipo' | 'caja'>,
  u: Ubicacion,
) {
  const rnd = azar(f.id);
  if (f.tipo === 'recuadro') {
    if (f.caja) cuadroLapiz(ctx, f.caja, esLapiz(f.color) ? LAPICES[f.color].hex : LAPICES.grafito.hex, u, rnd);
    return;
  }
  if (f.tipo === 'encerrado' || esLapiz(f.color)) {
    const hex = esLapiz(f.color) ? LAPICES[f.color].hex : LAPICES.grafito.hex;
    if (f.trazo) trazoLapiz(ctx, f.trazo, hex, u, rnd);
    return;
  }
  const rgb = RESALTADORES[f.color].rgb;
  if (f.rects?.length) f.rects.forEach((r) => trazoResaltador(ctx, r, rgb, u, rnd));
  else if (f.trazo) bandaResaltador(ctx, f.trazo, f.grosor ?? 12, rgb, u);
}

/** Lienzo de marcas de una página: blanco, con todas sus frases multiplicadas. */
export function lienzoDeMarcas(ancho: number, alto: number, frases: Frase[], u: Ubicacion, reusar?: HTMLCanvasElement): HTMLCanvasElement {
  const c = reusar ?? document.createElement('canvas');
  if (c.width !== ancho || c.height !== alto) {
    c.width = ancho;
    c.height = alto;
  }
  const ctx = c.getContext('2d')!;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.globalCompositeOperation = 'multiply';
  for (const f of frases) dibujarFrase(ctx, f, u);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/** Caja (en unidades de la página) que ocupa una marca. */
export function cajaDe(f: Pick<Frase, 'rects' | 'trazo' | 'grosor' | 'caja'>): Rect | null {
  if (f.caja) return f.caja;
  const xs: number[] = [];
  const ys: number[] = [];
  f.rects?.forEach(([x, y, w, h]) => {
    xs.push(x, x + w);
    ys.push(y, y + h);
  });
  const m = f.grosor ? f.grosor / 2 : 0;
  f.trazo?.forEach(([x, y]) => {
    xs.push(x - m, x + m);
    ys.push(y - m, y + m);
  });
  if (!xs.length) return null;
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0];
}

/** ¿Toca el punto (u, v) esta marca? Para el borrador. */
export function tocaMarca(f: Frase, u: number, v: number, tolerancia: number): boolean {
  if (f.caja) {
    // Un recuadro se borra tocando dentro de él.
    const [x, y, w, h] = f.caja;
    return u >= x - tolerancia && u <= x + w + tolerancia && v >= y - tolerancia && v <= y + h + tolerancia;
  }
  if (f.rects?.some(([x, y, w, h]) => u >= x - tolerancia && u <= x + w + tolerancia && v >= y - tolerancia && v <= y + h + tolerancia)) return true;
  const t = f.trazo;
  if (!t) return false;
  const tol = tolerancia + (f.grosor ?? 0) / 2;
  for (let i = 1; i < t.length; i++) {
    const [ax, ay] = t[i - 1];
    const [bx, by] = t[i];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / l2));
    if (Math.hypot(ax + k * dx - u, ay + k * dy - v) <= tol) return true;
  }
  return false;
}

/**
 * Contorno a lápiz generado alrededor de un texto ya maquetado (para las tarjetas de Mis frases):
 * sigue los renglones, da una vuelta y un poco más, con temblor de mano.
 * `lineas` son las cajas de cada renglón, en px relativos al contenedor.
 */
export function lazoAlrededor(lineas: { l: number; r: number; t: number; b: number }[], semilla: string): string {
  if (!lineas.length) return '';
  const rnd = azar(semilla);
  const f1 = rnd() * 6;
  const f2 = rnd() * 6;
  const x0 = Math.min(...lineas.map((l) => l.l));
  const x1 = Math.max(...lineas.map((l) => l.r));
  const y0 = lineas[0].t;
  const y1 = lineas[lineas.length - 1].b;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  let base: number[][];
  if (lineas.length === 1) {
    const rx = (x1 - x0) / 2 + 9;
    const ry = (y1 - y0) / 2 + 6;
    base = [];
    for (let i = 0; i < 90; i++) {
      const th = Math.PI * 0.8 + (i / 90) * Math.PI * 2;
      base.push([cx + rx * Math.cos(th), cy + ry * Math.sin(th)]);
    }
  } else {
    const pad = 5;
    const mid = (i: number) => (lineas[i].b + lineas[i + 1].t) / 2;
    const P: number[][] = [];
    lineas.forEach((l, i) => {
      P.push([l.r + pad, i ? mid(i - 1) : l.t - pad]);
      P.push([l.r + pad, i < lineas.length - 1 ? mid(i) : l.b + pad]);
    });
    for (let i = lineas.length - 1; i >= 0; i--) {
      const l = lineas[i];
      P.push([l.l - pad, i < lineas.length - 1 ? mid(i) : l.b + pad]);
      P.push([l.l - pad, i ? mid(i - 1) : l.t - pad]);
    }
    base = P;
    for (let k = 0; k < 4; k++) {
      const q: number[][] = [];
      base.forEach((p, i) => {
        const n = base[(i + 1) % base.length];
        q.push([p[0] * 0.75 + n[0] * 0.25, p[1] * 0.75 + n[1] * 0.25], [p[0] * 0.25 + n[0] * 0.75, p[1] * 0.25 + n[1] * 0.75]);
      });
      base = q;
    }
    // Empezar abajo a la izquierda, como se suele cerrar a mano.
    let k0 = 0;
    let mejor = -1e9;
    base.forEach((p, i) => {
      const v = p[1] - p[0] * 0.6;
      if (v > mejor) {
        mejor = v;
        k0 = i;
      }
    });
    base = base.slice(k0).concat(base.slice(0, k0));
  }
  const N = base.length;
  const extra = Math.round(N * 0.12);
  const pts: number[][] = [];
  for (let i = 0; i <= N + extra; i++) {
    const p = base[i % N];
    const t = i / (N + extra);
    const th = Math.atan2(p[1] - cy, p[0] - cx);
    const w = 1 + 0.03 * Math.sin(th * 2 + f1) + 0.018 * Math.sin(th * 3 + f2) + 0.07 * t;
    pts.push([cx + (p[0] - cx) * (w + 0.01), cy + (p[1] - cy) * (w + 0.12 * t) - 1.2 * t]);
  }
  return 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
}

export const colorCss = (c: ColorMarca) => (esLapiz(c) ? LAPICES[c].hex : `rgb(${RESALTADORES[c].rgb.join(',')})`);
