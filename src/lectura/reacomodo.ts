// Leer de pie en el celular: los renglones del PDF se vuelven a acomodar al ancho de la pantalla.
// No se cambia el texto ni la letra: cada palabra es un recorte de la página tal como viene en el
// PDF, solo que más grande y en renglones más cortos (la idea de k2pdfopt). El PDF no se toca.
//
// Los renglones y las palabras se buscan en la imagen de la página (franjas con tinta y los
// blancos entre ellas), así que sirve también para PDFs escaneados. De la capa de texto, si la hay,
// solo se toma qué renglones terminan en una palabra cortada con guion.

import type { TextoPagina } from '../frases/texto';

/** Una palabra de la página (unidades de la página: puntos, origen arriba a la izquierda). */
export interface Palabra {
  x0: number;
  x1: number;
  /** Franja del renglón (todas las palabras de un renglón comparten la misma: quedan alineadas). */
  top: number;
  bottom: number;
  /** Línea base del renglón (donde se apoyan las letras): para alinear palabras de renglones distintos. */
  base: number;
  /** Termina en guion de corte (al final del renglón): se pega con la siguiente, sin el guion. */
  guion?: boolean;
  x1SinGuion?: number;
}

export interface Renglon {
  palabras: Palabra[];
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  base: number;
  /** Una figura (dibujo, foto, tabla): va entera, en su propio lugar. */
  figura?: boolean;
}

export interface Parrafo {
  renglones: Renglon[];
  centrado: boolean;
  sangria: boolean;
  /** Había un espacio de más antes (separación entre bloques). */
  aire: boolean;
}

const mediana = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Los renglones y sus palabras, buscados en la imagen de la página en grises (`k` píxeles por
 * unidad de la página). Primero las franjas con tinta (renglones), luego, dentro de cada una,
 * los blancos anchos (espacios entre palabras).
 */
export function renglonesDeImagen(gris: ArrayLike<number>, ancho: number, alto: number, k: number): Renglon[] {
  // El fondo es el brillo más común; tinta es lo bastante más oscuro que él.
  const hist = new Uint32Array(256);
  for (let i = 0; i < ancho * alto; i++) hist[gris[i] | 0]++;
  let fondo = 255;
  for (let v = 0, acc = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= (ancho * alto) / 2) {
      fondo = v;
      break;
    }
  }
  const umbral = fondo - 60;
  const tinta = (x: number, y: number) => gris[y * ancho + x] < umbral;

  // 1. Filas con tinta → franjas.
  const filas = new Uint32Array(alto);
  for (let y = 0; y < alto; y++) {
    let n = 0;
    for (let x = 0; x < ancho; x++) if (tinta(x, y)) n++;
    filas[y] = n;
  }
  let franjas: [number, number][] = [];
  for (let y = 0; y < alto; ) {
    while (y < alto && filas[y] === 0) y++;
    const a = y;
    while (y < alto && filas[y] > 0) y++;
    if (y > a) franjas.push([a, y]);
  }
  if (!franjas.length) return [];
  const altoTipico = mediana(franjas.map(([a, b]) => b - a).filter((h) => h > 2));
  // Tildes y puntos sueltos (franjas muy finas) se juntan con la franja de al lado más cercana.
  const juntas: [number, number][] = [];
  for (const f of franjas) {
    const previa = juntas[juntas.length - 1];
    if (previa && (f[1] - f[0] < altoTipico * 0.35 || previa[1] - previa[0] < altoTipico * 0.35) && f[0] - previa[1] < altoTipico * 0.35)
      previa[1] = f[1];
    else juntas.push([...f]);
  }
  franjas = juntas;
  // Dos renglones pegados (las colas de uno tocan al de abajo): se cortan donde hay menos tinta.
  const altoRenglon = mediana(franjas.map(([a, b]) => b - a));
  const separadas: [number, number][] = [];
  for (const [a, b] of franjas) {
    const n = Math.round((b - a) / altoRenglon);
    if (n >= 2 && b - a < altoRenglon * 4.5) {
      let ini = a;
      for (let i = 1; i < n; i++) {
        const centro = a + ((b - a) * i) / n;
        let mejor = Math.round(centro);
        for (let y = Math.round(centro - altoRenglon * 0.3); y <= centro + altoRenglon * 0.3; y++) if (filas[y] < filas[mejor]) mejor = y;
        separadas.push([ini, mejor]);
        ini = mejor;
      }
      separadas.push([ini, b]);
    } else separadas.push([a, b]);
  }

  // 2. En cada franja, columnas con tinta → palabras (o una figura, si la franja es muy alta).
  const renglones: Renglon[] = [];
  for (const [a, b] of separadas) {
    const h = b - a;
    const cols = new Uint8Array(ancho);
    for (let y = a; y < b; y++) for (let x = 0; x < ancho; x++) if (tinta(x, y)) cols[x] = 1;
    let x0 = 0;
    while (x0 < ancho && !cols[x0]) x0++;
    let x1 = ancho - 1;
    while (x1 > x0 && !cols[x1]) x1--;
    if (x0 >= x1) continue;
    const top = a / k;
    const bottom = b / k;
    if (h > altoRenglon * 3) {
      const caja = { x0: x0 / k, x1: (x1 + 1) / k, top, bottom, base: bottom };
      renglones.push({ ...caja, palabras: [caja], figura: true });
      continue;
    }
    // La línea base: la última fila con mucha tinta (debajo solo quedan las colas de g, p, q…).
    let max = 0;
    for (let y = a; y < b; y++) max = Math.max(max, filas[y]);
    let yb = b - 1;
    while (yb > a && filas[yb] < max * 0.3) yb--;
    const base = (yb + 1) / k;
    const hueco = Math.max(2, h * 0.19); // blanco que separa dos palabras
    const palabras: Palabra[] = [];
    let ini = x0;
    let blanco = 0;
    for (let x = x0; x <= x1 + 1; x++) {
      if (x <= x1 && cols[x]) {
        if (blanco >= hueco && x - blanco > ini) {
          palabras.push({ x0: ini / k, x1: (x - blanco) / k, top, bottom, base });
          ini = x;
        }
        blanco = 0;
      } else blanco++;
    }
    palabras.push({ x0: ini / k, x1: (x1 + 1) / k, top, bottom, base });
    renglones.push({ palabras, x0: x0 / k, x1: (x1 + 1) / k, top, bottom, base });
  }
  return renglones;
}

/**
 * Con la capa de texto: marca los renglones que terminan en una palabra cortada con guion, para
 * pegarla con su otra mitad (y quitar el guion) al acomodarla.
 */
export function marcarGuiones(renglones: Renglon[], t: TextoPagina | null) {
  if (!t?.tieneTexto) return;
  const porLinea = new Map<number, TextoPagina['letras']>();
  for (const l of t.letras) {
    if (l.virtual || /\s/.test(l.c)) continue;
    const r = porLinea.get(l.linea);
    if (r) r.push(l);
    else porLinea.set(l.linea, [l]);
  }
  for (const letras of porLinea.values()) {
    letras.sort((p, q) => p.x0 - q.x0);
    if (letras.length < 2) continue;
    const [penultima, ultima] = letras.slice(-2);
    if (!/[-‐­]/.test(ultima.c) || !/\p{L}/u.test(penultima.c)) continue;
    const centro = (ultima.top + ultima.bottom) / 2;
    const r = renglones.find((x) => !x.figura && centro >= x.top && centro <= x.bottom);
    const w = r?.palabras[r.palabras.length - 1];
    if (w) {
      w.guion = true;
      w.x1SinGuion = Math.max(w.x0 + (w.x1 - w.x0) * 0.4, w.x1 - (ultima.x1 - ultima.x0) * 1.1);
    }
  }
}

/**
 * Quita lo que no es el cuerpo del texto: encabezados y pies que se repiten en cada hoja (título del
 * libro, autor, número de página, una dirección web). Son renglones sueltos arriba o abajo, lejos
 * del cuerpo, y de letra más chica (o muy cortos, como un número). Un título de capítulo, más
 * grande, se queda.
 */
export function sinMargenes(renglones: Renglon[]): Renglon[] {
  if (renglones.length < 4) return renglones;
  const alto = mediana(renglones.map((r) => r.bottom - r.top));
  const pasos = renglones.slice(1).map((r, i) => r.top - renglones[i].top).filter((p) => p > alto * 0.5);
  const paso = mediana(pasos) || alto * 1.3;
  const deMargen = (r: Renglon) => !r.figura && (r.bottom - r.top <= alto * 0.95 || r.x1 - r.x0 < alto * 3);
  let a = 0;
  let b = renglones.length - 1;
  while (a < b && a < 3 && renglones[a + 1].top - renglones[a].top > paso * 1.8 && deMargen(renglones[a])) a++;
  while (b > a && renglones.length - 1 - b < 3 && renglones[b].top - renglones[b - 1].top > paso * 1.8 && deMargen(renglones[b])) b--;
  return renglones.slice(a, b + 1);
}

/** Agrupa los renglones en párrafos (por la sangría, el aire de más o el renglón corto anterior). */
export function parrafosDe(renglones: Renglon[]): Parrafo[] {
  const texto = renglones.filter((r) => !r.figura);
  if (!renglones.length) return [];
  const alto = mediana(texto.map((r) => r.bottom - r.top)) || 10;
  const pasos = texto.slice(1).map((r, i) => r.top - texto[i].top).filter((p) => p > alto * 0.5);
  const paso = mediana(pasos) || alto * 1.3;
  // Los bordes del cuerpo del texto: los renglones llenos marcan el ancho de la caja.
  const izq = mediana(texto.map((r) => r.x0));
  const derechos = texto.map((r) => r.x1).sort((a, b) => a - b);
  const der = derechos[Math.floor(derechos.length * 0.8)] ?? 0;
  const ancho = der - izq;
  const centrado = (r: Renglon) => r.x1 - r.x0 < ancho * 0.8 && Math.abs(r.x0 - izq - (der - r.x1)) < alto * 1.5 && r.x0 - izq > alto * 1.5;
  const parrafos: Parrafo[] = [];
  renglones.forEach((r, i) => {
    const previo = renglones[i - 1];
    if (r.figura) {
      parrafos.push({ renglones: [r], centrado: true, sangria: false, aire: true });
      return;
    }
    const aire = !!previo && r.top - previo.bottom > paso - alto + alto * 0.7;
    const sangria = r.x0 - izq > alto * 0.5 && !centrado(r);
    const anteriorCorto = !!previo && !previo.figura && previo.x1 < der - alto * 2;
    const ultimo = parrafos[parrafos.length - 1];
    const otraLetra = !!previo && Math.abs(r.bottom - r.top - (previo.bottom - previo.top)) > alto * 0.45;
    const nuevo = !ultimo || aire || sangria || centrado(r) || ultimo.centrado || anteriorCorto || otraLetra;
    if (nuevo) parrafos.push({ renglones: [r], centrado: centrado(r), sangria, aire });
    else ultimo.renglones.push(r);
  });
  return parrafos;
}

/** Una palabra ya ubicada en la hoja nueva (px CSS) y de dónde se recorta en la página original. */
export interface Pieza {
  /** Recorte en la página original (unidades de la página). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Lugar en la hoja nueva (px CSS). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Hoja {
  piezas: Pieza[];
}

export interface OpcionesMaqueta {
  /** Tamaño de la hoja nueva y márgenes, en px CSS. */
  ancho: number;
  alto: number;
  margenX: number;
  margenArriba: number;
  margenAbajo: number;
  /** Alto que debe tener un renglón de letra normal (de lo más alto a lo más bajo), en px CSS. */
  letra: number;
}

/**
 * Acomoda los párrafos en hojas del tamaño de la pantalla. Devuelve también la escala (px CSS por
 * unidad de la página), para dibujar la página original con el detalle justo.
 */
export function maquetar(parrafos: Parrafo[], o: OpcionesMaqueta): { hojas: Hoja[]; escala: number } {
  const texto = parrafos.flatMap((p) => p.renglones).filter((r) => !r.figura);
  if (!parrafos.length) return { hojas: [], escala: 1 };
  const altoOriginal = mediana(texto.map((r) => r.bottom - r.top)) || 10;
  const pasos = texto.slice(1).map((r, i) => r.top - texto[i].top).filter((p) => p > altoOriginal * 0.5 && p < altoOriginal * 2.5);
  const pasoOriginal = mediana(pasos) || altoOriginal * 1.3;
  const s = o.letra / altoOriginal; // px CSS por unidad de la página
  const paso = Math.max(pasoOriginal * s, o.letra * 1.08);
  const espacio = o.letra * 0.3;
  const anchoUtil = o.ancho - 2 * o.margenX;
  const altoUtil = o.alto - o.margenArriba - o.margenAbajo;

  const hojas: Hoja[] = [{ piezas: [] }];
  let y = o.margenArriba;
  const hoja = () => hojas[hojas.length - 1];
  const lugar = (alto: number) => {
    if (y + alto > o.alto - o.margenAbajo && hoja().piezas.length) {
      hojas.push({ piezas: [] });
      y = o.margenArriba;
    }
  };

  for (const p of parrafos) {
    if (p.renglones[0].figura) {
      // Una figura: entera, al ancho que quepa.
      const f = p.renglones[0];
      const fw = f.x1 - f.x0;
      const fh = f.bottom - f.top;
      const e = Math.min(s, anchoUtil / fw, altoUtil / fh);
      if (hoja().piezas.length) y += paso * 0.4;
      lugar(fh * e);
      hoja().piezas.push({ sx: f.x0, sy: f.top, sw: fw, sh: fh, x: o.margenX + (anchoUtil - fw * e) / 2, y, w: fw * e, h: fh * e });
      y += fh * e + paso * 0.4;
      continue;
    }
    // Palabras del párrafo, con las cortadas por guion ya unidas (dos recortes, sin el guion).
    type Trozo = { partes: Palabra[]; ancho: number };
    const trozos: Trozo[] = [];
    let pegar = false;
    for (const r of p.renglones)
      for (const w of r.palabras) {
        const corta = !!w.guion && w === r.palabras[r.palabras.length - 1];
        const ancho = ((corta && w.x1SinGuion ? w.x1SinGuion : w.x1) - w.x0) * s;
        if (pegar && trozos.length) {
          const t = trozos[trozos.length - 1];
          t.partes.push(w);
          t.ancho += ancho;
        } else trozos.push({ partes: [w], ancho });
        pegar = corta;
      }
    const altoRenglon = Math.max(...p.renglones.map((r) => r.bottom - r.top)) * s;
    const pasoParrafo = Math.max(paso, altoRenglon * 1.12);
    // Todas las palabras del renglón nuevo se apoyan en la misma línea base.
    const sube = Math.max(...p.renglones.map((r) => r.base - r.top)) * s;
    const baja = Math.max(...p.renglones.map((r) => r.bottom - r.base)) * s;
    const lineaBase = (pasoParrafo - (sube + baja)) / 2 + sube;
    if (p.aire && hoja().piezas.length) y += paso * 0.5;
    let i = 0;
    let primero = true;
    while (i < trozos.length) {
      const sangria = primero && p.sangria ? o.letra * 1.3 : 0;
      // Cuántas palabras caben en este renglón.
      let ancho = 0;
      let j = i;
      while (j < trozos.length) {
        const extra = (j > i ? espacio : 0) + Math.min(trozos[j].ancho, anchoUtil);
        if (j > i && sangria + ancho + extra > anchoUtil) break;
        ancho += extra;
        j++;
      }
      lugar(pasoParrafo);
      const ultimo = j >= trozos.length;
      const huecos = j - i - 1;
      // Justificado como en el libro, salvo el último renglón del párrafo y los títulos centrados.
      const sobra = anchoUtil - sangria - ancho;
      const extraHueco = !ultimo && !p.centrado && huecos > 0 && sobra < anchoUtil * 0.35 ? sobra / huecos : 0;
      let x = o.margenX + sangria + (p.centrado ? sobra / 2 : 0);
      for (let k = i; k < j; k++) {
        const t = trozos[k];
        const reduce = Math.min(1, anchoUtil / t.ancho); // una palabra más ancha que la pantalla se achica
        t.partes.forEach((w, n) => {
          const sinGuion = w.guion && n < t.partes.length - 1 && w.x1SinGuion;
          const sw = (sinGuion ? w.x1SinGuion! : w.x1) - w.x0;
          const sh = w.bottom - w.top;
          const pw = sw * s * reduce;
          const ph = sh * s * reduce;
          hoja().piezas.push({ sx: w.x0, sy: w.top, sw, sh, x, y: y + lineaBase - (w.base - w.top) * s * reduce, w: pw, h: ph });
          x += pw;
        });
        x += espacio + extraHueco;
      }
      y += pasoParrafo;
      i = j;
      primero = false;
    }
  }
  return { hojas: hojas.filter((h) => h.piezas.length), escala: s };
}

/** Dibuja una hoja nueva: cada pieza se recorta de la página original ya dibujada (`k` px por unidad). */
export function dibujarHoja(ctx: CanvasRenderingContext2D, hoja: Hoja, pagina: CanvasImageSource, k: number, dpr: number) {
  for (const p of hoja.piezas) ctx.drawImage(pagina, p.sx * k, p.sy * k, p.sw * k, p.sh * k, p.x * dpr, p.y * dpr, p.w * dpr, p.h * dpr);
}
