// Tarjetas para compartir una frase: la frase dentro de un marco, en formato de estado de WhatsApp o
// de historia (1080 × 1920). Se dibuja solo el texto, bien escrito (sin el resaltador ni el lápiz
// con que la marqué), y abajo solo el nombre del libro.

import { azar } from './dibujo';
import { esLapiz, RESALTADORES, type Frase } from './modelo';

export type Marco = 'clasico' | 'antiguo' | 'noche' | 'cuaderno' | 'flor';

export const MARCOS: { id: Marco; nombre: string }[] = [
  { id: 'clasico', nombre: 'Clásico' },
  { id: 'antiguo', nombre: 'Antiguo' },
  { id: 'noche', nombre: 'Noche' },
  { id: 'cuaderno', nombre: 'Cuaderno' },
  { id: 'flor', nombre: 'Flor seca' },
];

export const ANCHO = 1080;
export const ALTO = 1920;

export interface DatosTarjeta {
  titulo: string;
  autor?: string;
  /** El recorte de la página, si la frase es de un PDF escaneado (sin texto). */
  imagen?: CanvasImageSource | null;
  /** El texto, si lo corregí antes de compartir (si no, el de la frase, ordenado). */
  texto?: string;
}

/** Las palabras de una sola letra que existen en español (las demás sueltas son restos de un corte). */
const LETRA_SOLA = /^[aeouyAEOUY]$/;

/**
 * El texto de la frase limpio: sin espacios de más, sin letras sueltas («C A P Í T U L O» →
 * «CAPÍTULO»), con las palabras cortadas al final del renglón unidas y sin restos de una capitular.
 */
export function limpiarTexto(texto: string): string {
  // Letras espaciadas (títulos, capitulares): cuatro o más letras sueltas seguidas forman una
  // palabra (un espacio doble separa una palabra de otra).
  let t = texto.replace(/(?:^|(?<=\s))(?:\p{L} ){3,}\p{L}(?=\s|$|[,.;:])/gu, (m) => m.replace(/ /g, ''));
  t = t.replace(/\s+/g, ' ').trim();
  // Palabras cortadas con guion al final del renglón («pala- bra» → «palabra»).
  t = t.replace(/(\p{Ll})[-‐\u00AD] (\p{Ll})/gu, '$1$2');
  // Una letra suelta al principio que no es palabra (la capitular perdida de «En un lugar…»).
  t = t.replace(/^[«"“(—–-]*\s*/u, '');
  const primera = t.split(' ')[0];
  if (/^\p{L}$/u.test(primera) && !LETRA_SOLA.test(primera)) t = t.slice(primera.length).trim();
  return t.replace(/[\s—–-]+$/u, '');
}

/** Puntos suspensivos donde la frase empieza o termina a mitad de una oración. */
export function conPuntos(texto: string): string {
  let t = texto.trim();
  if (!t) return '';
  if (/^\p{Ll}/u.test(t)) t = `…${t}`;
  if (/[,;:]$/.test(t)) t = t.slice(0, -1);
  if (!/[.!?…»"”)]$/.test(t)) t = `${t}…`;
  return t;
}

/** El texto de la frase bien escrito para la tarjeta. */
export const textoBonito = (texto: string) => conPuntos(limpiarTexto(texto));

/** Las palabras de una frase, tal como se pueden borrar al compartir. */
export const palabrasDe = (texto: string) => limpiarTexto(texto).split(' ').filter(Boolean);

type Ctx = CanvasRenderingContext2D;
type Caja = { x: number; y: number; w: number; h: number };

interface Estilo {
  /** El papel y lo que va detrás del texto. */
  fondo: (ctx: Ctx, rnd: () => number) => void;
  caja: Caja;
  letra: (px: number) => string;
  /** Alto de renglón, en veces el tamaño de la letra. */
  renglon: number;
  tinta: string;
  alinear: 'center' | 'left';
  tamanos: [min: number, max: number];
  oscuro?: boolean;
  /** Lo que va debajo de la frase: el libro, el autor y la página. Recibe dónde terminó el texto. */
  pie: (ctx: Ctx, f: Frase, d: DatosTarjeta, fin: number, rnd: () => number) => void;
  /** Lo que va encima de todo (la cinta, la cinta adhesiva…). */
  encima?: (ctx: Ctx, rnd: () => number, f: Frase) => void;
  /** Algo pegado arriba del texto (las comillas del clásico): recibe dónde empieza el texto. */
  sobreTexto?: (ctx: Ctx, arriba: number) => void;
  /** Cuaderno: los renglones se dibujan a la altura del texto. */
  conRenglones?: (ctx: Ctx, primeraBase: number, alto: number) => void;
}

// ---------- ayudas de dibujo ----------

/** Grano de papel: ruido fino multiplicado sobre el fondo (sin imágenes externas). */
function grano(ctx: Ctx, fuerza: number, rnd: () => number, claro = false) {
  const w = 360;
  const h = 640;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = claro ? 255 - rnd() * 255 * fuerza : 255 - rnd() * 255 * fuerza;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = claro ? 'screen' : 'multiply';
  ctx.globalAlpha = claro ? 0.05 : 1;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, ANCHO, ALTO);
  ctx.restore();
}

/** Bordes tostados (o en sombra) hacia las orillas de la hoja. */
function vineta(ctx: Ctx, color: string, alfa: number, desde = 0.45) {
  const g = ctx.createRadialGradient(ANCHO / 2, ALTO / 2, Math.min(ANCHO, ALTO) * desde, ANCHO / 2, ALTO / 2, Math.hypot(ANCHO, ALTO) / 2);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${alfa})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ANCHO, ALTO);
}

/** Separa el texto en renglones que caben en `ancho`. */
function renglones(ctx: Ctx, texto: string, ancho: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const salida: string[] = [];
  let linea = '';
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width <= ancho || !linea) linea = prueba;
    else {
      salida.push(linea);
      linea = p;
    }
  }
  if (linea) salida.push(linea);
  return salida;
}

/** El tamaño de letra más grande con que la frase cabe en la caja (y los renglones a ese tamaño). */
function acomodar(ctx: Ctx, texto: string, e: Estilo) {
  let [min, max] = e.tamanos;
  let mejor = { px: min, lineas: [] as string[] };
  for (let i = 0; i < 18 && max - min > 0.5; i++) {
    const px = (min + max) / 2;
    ctx.font = e.letra(px);
    const lineas = renglones(ctx, texto, e.caja.w);
    if (lineas.length * px * e.renglon <= e.caja.h) {
      mejor = { px, lineas };
      min = px;
    } else max = px;
  }
  if (!mejor.lineas.length) {
    ctx.font = e.letra(mejor.px);
    mejor.lineas = renglones(ctx, texto, e.caja.w);
  }
  // Si ni con la letra más chica cabe, se corta con «…».
  const caben = Math.floor(e.caja.h / (mejor.px * e.renglon));
  if (mejor.lineas.length > caben) {
    mejor.lineas = mejor.lineas.slice(0, caben);
    mejor.lineas[caben - 1] = mejor.lineas[caben - 1].replace(/[\s,;:.]*\S*$/, '') + '…';
  }
  return mejor;
}

/** Una línea centrada; si no cabe (un título largo), la letra se achica. */
function centrado(ctx: Ctx, texto: string, y: number, letra: string, color: string, espaciado = 0) {
  ctx.font = letra;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${espaciado}px`;
  const max = ANCHO - 240;
  const ancho = ctx.measureText(texto).width;
  if (ancho > max) ctx.font = letra.replace(/(\d+(?:\.\d+)?)px/, (_, px: string) => `${Math.max(20, (+px * max) / ancho).toFixed(1)}px`);
  ctx.fillText(texto, ANCHO / 2, y);
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = '0px';
}

/** Un adorno de imprenta: un rombo con dos volutas a los lados (dibujado, no una letra). */
function adorno(ctx: Ctx, x: number, y: number, escala: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(escala, escala);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(9, 0);
  ctx.lineTo(0, 10);
  ctx.lineTo(-9, 0);
  ctx.closePath();
  ctx.fill();
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(s * 18, 0);
    ctx.bezierCurveTo(s * 40, -16, s * 62, 12, s * 80, -2);
    ctx.bezierCurveTo(s * 90, -10, s * 102, -4, s * 98, 4);
    ctx.stroke();
  }
  ctx.restore();
}


/** La firma de la app, chiquita, al pie. */
function firma(ctx: Ctx, color: string) {
  centrado(ctx, 'ENTRE HOJAS', ALTO - 110, '600 22px "DM Sans"', color, 7);
}

/** Pie de la mayoría de los marcos: una rayita y el nombre del libro en cursiva. */
function pieComun(tinta: string, raya: string) {
  return (ctx: Ctx, _f: Frase, d: DatosTarjeta, fin: number) => {
    const y = Math.min(fin + 90, ALTO - 300);
    ctx.fillStyle = raya;
    ctx.fillRect(ANCHO / 2 - 50, y, 100, 3);
    centrado(ctx, d.titulo, y + 82, 'italic 400 46px "Fraunces"', tinta);
  };
}

// ---------- los cinco marcos ----------

const ESTILOS: Record<Marco, Estilo> = {
  clasico: {
    fondo: (ctx, rnd) => {
      ctx.fillStyle = '#F5EDDB';
      ctx.fillRect(0, 0, ANCHO, ALTO);
      grano(ctx, 0.07, rnd);
      vineta(ctx, '120,90,50', 0.16);
      // Filete doble, como en la portadilla de un libro.
      ctx.strokeStyle = 'rgba(42,37,32,.38)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(72, 72, ANCHO - 144, ALTO - 144);
      ctx.strokeStyle = 'rgba(42,37,32,.22)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(88, 88, ANCHO - 176, ALTO - 176);
    },
    sobreTexto: (ctx, arriba) => {
      // Comillas grandes de apertura, justo sobre la frase.
      ctx.font = 'italic 400 230px "Fraunces"';
      ctx.fillStyle = 'rgba(142,47,42,.85)';
      ctx.textAlign = 'center';
      ctx.fillText('«', ANCHO / 2, Math.max(330, arriba - 40));
    },
    caja: { x: 150, y: 540, w: 780, h: 860 },
    letra: (px) => `400 ${px}px "EB Garamond"`,
    renglon: 1.32,
    tinta: '#2A2520',
    alinear: 'center',
    tamanos: [40, 110],
    pie: pieComun('#2A2520', 'rgba(142,47,42,.7)'),
    encima: (ctx) => {
      // La cinta marcapáginas que cuelga desde arriba.
      const x = 840;
      const w = 56;
      const largo = 360;
      ctx.save();
      ctx.shadowColor = 'rgba(60,20,10,.35)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#7A2622');
      g.addColorStop(0.5, '#A2403A');
      g.addColorStop(1, '#7A2622');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + w, 0);
      ctx.lineTo(x + w, largo);
      ctx.lineTo(x + w / 2, largo - 30);
      ctx.lineTo(x, largo);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      firma(ctx, 'rgba(106,96,86,.55)');
    },
  },

  antiguo: {
    fondo: (ctx, rnd) => {
      ctx.fillStyle = '#E7D3AA';
      ctx.fillRect(0, 0, ANCHO, ALTO);
      grano(ctx, 0.13, rnd);
      // Manchitas del tiempo.
      for (let i = 0; i < 22; i++) {
        const x = rnd() * ANCHO;
        const y = rnd() * ALTO;
        const r = 6 + rnd() * 40;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(140,90,40,${0.08 + rnd() * 0.12})`);
        g.addColorStop(1, 'rgba(140,90,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      vineta(ctx, '110,62,20', 0.62, 0.32);
      // Marco con adornos en las esquinas.
      ctx.strokeStyle = 'rgba(92,60,30,.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(110, 110, ANCHO - 220, ALTO - 220);
      const esquina = (x: number, y: number, sx: number, sy: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(sx, sy);
        ctx.strokeStyle = 'rgba(92,60,30,.7)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(0, 70);
        ctx.bezierCurveTo(0, 20, 20, 0, 70, 0);
        ctx.moveTo(18, 70);
        ctx.bezierCurveTo(18, 40, 30, 18, 60, 18);
        ctx.bezierCurveTo(44, 26, 40, 44, 52, 52);
        ctx.bezierCurveTo(62, 58, 72, 46, 64, 38);
        ctx.stroke();
        ctx.fillStyle = 'rgba(92,60,30,.7)';
        ctx.beginPath();
        ctx.arc(30, 30, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      esquina(110, 110, 1, 1);
      esquina(ANCHO - 110, 110, -1, 1);
      esquina(110, ALTO - 110, 1, -1);
      esquina(ANCHO - 110, ALTO - 110, -1, -1);
      // Un adorno al centro, arriba.
      adorno(ctx, ANCHO / 2, 400, 1.3, 'rgba(92,60,30,.75)');
    },
    caja: { x: 170, y: 520, w: 740, h: 900 },
    letra: (px) => `italic 400 ${px}px "EB Garamond"`,
    renglon: 1.34,
    tinta: '#3A2817',
    alinear: 'center',
    tamanos: [40, 104],
    pie: (ctx, _f, d, fin) => {
      const y = Math.min(fin + 80, ALTO - 300);
      adorno(ctx, ANCHO / 2, y, 0.8, 'rgba(92,60,30,.7)');
      centrado(ctx, d.titulo.toUpperCase(), y + 82, '400 38px "EB Garamond"', '#3A2817', 6);
    },
    encima: (ctx) => firma(ctx, 'rgba(92,60,30,.55)'),
  },

  noche: {
    fondo: (ctx, rnd) => {
      ctx.fillStyle = '#23201C';
      ctx.fillRect(0, 0, ANCHO, ALTO);
      // Luz cálida de lámpara en el centro.
      const g = ctx.createRadialGradient(ANCHO / 2, ALTO * 0.45, 40, ANCHO / 2, ALTO * 0.45, ALTO * 0.6);
      g.addColorStop(0, 'rgba(255,196,120,.10)');
      g.addColorStop(1, 'rgba(255,196,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ANCHO, ALTO);
      grano(ctx, 0.5, rnd, true);
      // Estrellitas.
      for (let i = 0; i < 26; i++) {
        const x = 120 + rnd() * (ANCHO - 240);
        const y = 130 + rnd() * 260;
        ctx.fillStyle = `rgba(230,210,170,${0.25 + rnd() * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, 1 + rnd() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Media luna (se recorta en un lienzo aparte, para no agujerear el fondo).
      const luna = document.createElement('canvas');
      luna.width = luna.height = 100;
      const l = luna.getContext('2d')!;
      l.fillStyle = '#D9BF86';
      l.beginPath();
      l.arc(50, 50, 46, 0, Math.PI * 2);
      l.fill();
      l.globalCompositeOperation = 'destination-out';
      l.beginPath();
      l.arc(72, 36, 42, 0, Math.PI * 2);
      l.fill();
      ctx.drawImage(luna, ANCHO / 2 - 50, 250);
      // Filete dorado.
      ctx.strokeStyle = 'rgba(201,168,106,.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(80, 80, ANCHO - 160, ALTO - 160);
    },
    caja: { x: 150, y: 500, w: 780, h: 920 },
    letra: (px) => `italic 400 ${px}px "Fraunces"`,
    renglon: 1.38,
    tinta: '#E8DDCB',
    alinear: 'center',
    tamanos: [38, 100],
    oscuro: true,
    pie: pieComun('#D6CCBA', 'rgba(201,168,106,.7)'),
    encima: (ctx) => firma(ctx, 'rgba(214,204,186,.4)'),
  },

  cuaderno: {
    fondo: (ctx, rnd) => {
      ctx.fillStyle = '#FBFAF6';
      ctx.fillRect(0, 0, ANCHO, ALTO);
      grano(ctx, 0.05, rnd);
      // Margen rojo doble.
      ctx.fillStyle = 'rgba(214,92,86,.55)';
      ctx.fillRect(170, 0, 3, ALTO);
      ctx.fillRect(178, 0, 2, ALTO);
      // Perforaciones.
      for (const y of [ALTO * 0.2, ALTO * 0.5, ALTO * 0.8]) {
        ctx.fillStyle = '#E4DCCB';
        ctx.beginPath();
        ctx.arc(80, y, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.12)';
        ctx.beginPath();
        ctx.arc(80, y + 3, 24, 0, Math.PI);
        ctx.fill();
      }
    },
    conRenglones: (ctx, primeraBase, alto) => {
      ctx.fillStyle = 'rgba(96,150,205,.38)';
      for (let y = primeraBase - Math.ceil(primeraBase / alto) * alto + alto; y < ALTO; y += alto) {
        if (y < 140) continue;
        ctx.fillRect(0, Math.round(y + alto * 0.14), ANCHO, 2);
      }
    },
    caja: { x: 220, y: 380, w: 760, h: 1080 },
    letra: (px) => `700 ${px}px "Caveat"`,
    renglon: 1.22,
    tinta: '#26364F',
    alinear: 'left',
    tamanos: [52, 130],
    pie: (ctx, _f, d, fin) => {
      ctx.font = '700 52px "Caveat"';
      ctx.fillStyle = '#4A5873';
      ctx.textAlign = 'right';
      ctx.fillText(`— ${d.titulo}`, ANCHO - 100, Math.min(fin + 110, ALTO - 260), ANCHO - 320);
    },
    encima: (ctx, rnd, f) => {
      // Cinta adhesiva arriba, del color de la marca.
      const rgb = esLapiz(f.color) ? [230, 200, 120] : RESALTADORES[f.color].rgb;
      ctx.save();
      ctx.translate(ANCHO - 230, 150);
      ctx.rotate(0.22 + (rnd() - 0.5) * 0.1);
      ctx.fillStyle = `rgba(${rgb.join(',')},.5)`;
      ctx.fillRect(-150, -38, 300, 76);
      ctx.restore();
      firma(ctx, 'rgba(74,88,115,.45)');
    },
  },

  flor: {
    fondo: (ctx, rnd) => {
      ctx.fillStyle = '#F4EBDA';
      ctx.fillRect(0, 0, ANCHO, ALTO);
      grano(ctx, 0.08, rnd);
      vineta(ctx, '140,110,70', 0.18);
      // El lomo del libro abierto, a la izquierda.
      const l = ctx.createLinearGradient(0, 0, 90, 0);
      l.addColorStop(0, 'rgba(90,60,30,.22)');
      l.addColorStop(1, 'rgba(90,60,30,0)');
      ctx.fillStyle = l;
      ctx.fillRect(0, 0, 90, ALTO);
      florSeca(ctx, 990, 1900, -0.25, 0.95, rnd);
      florSeca(ctx, 150, 150, 2.4, 0.62, rnd);
    },
    caja: { x: 160, y: 540, w: 760, h: 820 },
    letra: (px) => `italic 400 ${px}px "EB Garamond"`,
    renglon: 1.32,
    tinta: '#43362B',
    alinear: 'center',
    tamanos: [40, 104],
    pie: (ctx, _f, d, fin) => {
      const y = Math.min(fin + 70, ALTO - 400);
      centrado(ctx, d.titulo, y + 64, 'italic 400 44px "Fraunces"', '#43362B');
    },
    encima: (ctx) => {
      ctx.save();
      ctx.font = '700 46px "Caveat"';
      ctx.fillStyle = 'rgba(122,92,70,.7)';
      ctx.textAlign = 'left';
      ctx.translate(150, ALTO - 150);
      ctx.rotate(-0.06);
      ctx.fillText('entre hojas', 0, 0);
      ctx.restore();
    },
  },
};

/** Una florcita prensada (dibujo propio): tallo, hojas y cinco pétalos aplastados, con su sombra. */
function florSeca(ctx: Ctx, x: number, y: number, giro: number, escala: number, rnd: () => number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(giro);
  ctx.scale(escala, escala);
  const dibujar = (sombra: boolean) => {
    ctx.save();
    if (sombra) {
      ctx.translate(5, 7);
      ctx.globalAlpha = 0.12;
    }
    const tallo = sombra ? '#3A2A1A' : '#8C9A6A';
    // Tallo.
    ctx.strokeStyle = tallo;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-20, -120, 30, -220, 0, -340);
    ctx.stroke();
    // Hojas.
    for (const [hy, lado, rot] of [
      [-110, 1, 0.7],
      [-190, -1, -0.8],
      [-260, 1, 0.5],
    ] as const) {
      ctx.save();
      ctx.translate(lado * 4, hy);
      ctx.rotate(rot);
      ctx.fillStyle = sombra ? '#3A2A1A' : 'rgba(132,150,98,.85)';
      ctx.beginPath();
      ctx.ellipse(lado * 34, 0, 40, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!sombra) {
        ctx.strokeStyle = 'rgba(90,105,60,.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(lado * 66, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Pétalos.
    ctx.translate(0, -360);
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * Math.PI * 2 + 0.3);
      ctx.fillStyle = sombra ? '#3A2A1A' : `rgba(${178 + rnd() * 14},${128 + rnd() * 12},${146 + rnd() * 12},.82)`;
      ctx.beginPath();
      ctx.ellipse(0, -34, 22, 38, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!sombra) {
        ctx.strokeStyle = 'rgba(140,90,110,.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(0, -60);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = sombra ? '#3A2A1A' : '#C9A24A';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  ctx.globalCompositeOperation = 'multiply';
  dibujar(true);
  dibujar(false);
  ctx.restore();
}

// ---------- la tarjeta ----------

/** Espera las letras de las tarjetas (en el lienzo no se ven hasta que están cargadas). */
export async function cargarLetras() {
  await Promise.all(
    ['400 60px "EB Garamond"', 'italic 400 60px "EB Garamond"', 'italic 400 60px "Fraunces"', '500 30px "DM Sans"', '600 30px "DM Sans"', '700 60px "Caveat"'].map((f) =>
      document.fonts.load(f).catch(() => []),
    ),
  );
}

/** Dibuja la tarjeta de la frase en el lienzo (que queda de 1080 × 1920). */
export function dibujarTarjeta(lienzo: HTMLCanvasElement, f: Frase, d: DatosTarjeta, marco: Marco) {
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const ctx = lienzo.getContext('2d')!;
  const e = ESTILOS[marco];
  const rnd = azar(`${f.id}-${marco}`);
  ctx.textBaseline = 'alphabetic';
  e.fondo(ctx, rnd);

  let fin = e.caja.y + e.caja.h / 2;
  const texto = d.texto != null ? d.texto.replace(/\s+/g, ' ').trim() : textoBonito(f.texto);
  if (texto) {
    const { px, lineas } = acomodar(ctx, texto, e);
    const alto = px * e.renglon;
    const total = lineas.length * alto;
    const y0 = e.caja.y + (e.caja.h - total) / 2;
    ctx.font = e.letra(px);
    const base = (i: number) => y0 + i * alto + px * 0.98;
    e.conRenglones?.(ctx, base(0), alto);
    const caja = lineas.map((l, i) => {
      const w = ctx.measureText(l).width;
      const x = e.alinear === 'center' ? ANCHO / 2 - w / 2 : e.caja.x;
      return { l: x, r: x + w, t: base(i) - px * 0.78, b: base(i) + px * 0.22 };
    });
    ctx.font = e.letra(px);
    ctx.fillStyle = e.tinta;
    ctx.textAlign = 'left';
    lineas.forEach((l, i) => ctx.fillText(l, caja[i].l, base(i)));
    if (e.sobreTexto) {
      ctx.save();
      e.sobreTexto(ctx, base(0) - px * 0.8);
      ctx.restore();
    }
    fin = y0 + total;
  } else if (d.imagen) {
    // Página escaneada: el recorte, sobre el papel.
    const img = d.imagen as HTMLImageElement;
    const iw = (img as { naturalWidth?: number }).naturalWidth || (img as unknown as { width: number }).width;
    const ih = (img as { naturalHeight?: number }).naturalHeight || (img as unknown as { height: number }).height;
    const s = Math.min(e.caja.w / iw, e.caja.h / ih);
    const w = iw * s;
    const h = ih * s;
    const x = ANCHO / 2 - w / 2;
    const y = e.caja.y + (e.caja.h - h) / 2;
    ctx.save();
    if (e.oscuro) {
      ctx.fillStyle = '#F5EDDB';
      ctx.fillRect(x - 24, y - 24, w + 48, h + 48);
    } else ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(d.imagen, x, y, w, h);
    ctx.restore();
    fin = y + h;
  }
  e.pie(ctx, f, d, fin, rnd);
  e.encima?.(ctx, rnd, f);
}

/** La tarjeta como imagen PNG, lista para compartir o guardar. */
export async function tarjetaPng(f: Frase, d: DatosTarjeta, marco: Marco): Promise<Blob> {
  await cargarLetras();
  const c = document.createElement('canvas');
  dibujarTarjeta(c, f, d, marco);
  return await new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo crear la imagen'))), 'image/png'));
}
