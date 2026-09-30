// Dónde va la hoja en la pantalla y dónde cabe la página del PDF dentro de ella.
//  - Celular (vertical): la hoja ocupa toda la pantalla; el lomo es el borde izquierdo.
//  - Pantalla ancha (PC, tablet en horizontal): libro abierto a doble página sobre la mesa.
//  - Pantalla mediana (tablet en vertical): una hoja con la forma de la página, sobre la mesa.
// La página del PDF se ajusta entera dentro de la caja, sin recortarla ni deformarla.

export interface Margenes {
  arriba: number;
  abajo: number;
  izquierda: number;
  derecha: number;
}

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Disposicion {
  modo: 'celular' | 'mesa' | 'doble';
  /** La hoja: la página única o, en doble página, la de la derecha (el lomo es su borde izquierdo). */
  hoja: Caja;
  /** Donde cabe la página del PDF dentro de la hoja. */
  caja: Caja;
  /** Todo el libro (las dos páginas en doble página). */
  libro: Caja;
}

export interface OpcionesDisposicion {
  /** Ancho que ocupa el panel lateral (Mis frases) a la derecha, en pantallas anchas. */
  panel?: number;
  /** Alto de las barras de arriba y de abajo en pantallas anchas. */
  barraArriba?: number;
  barraAbajo?: number;
}

export function disponer(ancho: number, alto: number, seguro: Margenes, aspecto: number, o: OpcionesDisposicion = {}): Disposicion {
  const celular = ancho / alto < 0.9 || ancho < 560;
  if (celular) {
    const arriba = seguro.arriba + 30;
    const abajo = seguro.abajo + 30;
    const lado = 6;
    const hoja = { x: 0, y: 0, w: ancho, h: alto };
    return {
      modo: 'celular',
      hoja,
      libro: hoja,
      caja: {
        x: lado + seguro.izquierda,
        y: arriba,
        w: Math.max(50, ancho - 2 * lado - seguro.izquierda - seguro.derecha),
        h: Math.max(50, alto - arriba - abajo),
      },
    };
  }
  const panel = o.panel ?? 0;
  const barraArriba = (o.barraArriba ?? 0) + seguro.arriba;
  const barraAbajo = (o.barraAbajo ?? 0) + seguro.abajo;
  const anchoUtil = ancho - panel - seguro.izquierda - seguro.derecha;
  const altoUtil = alto - barraArriba - barraAbajo;
  const margen = 22;
  const bandaV = 34;
  const bandaH = 30;
  const doble = anchoUtil / Math.max(1, altoUtil) >= 1.12 && anchoUtil >= 700;
  const paginas = doble ? 2 : 1;
  let ch = altoUtil - 2 * margen - 2 * bandaV;
  let cw = ch * aspecto;
  const anchoMax = (anchoUtil - 2 * margen) / paginas - 2 * bandaH;
  if (cw > anchoMax) {
    cw = anchoMax;
    ch = cw / aspecto;
  }
  const w = Math.round(cw + 2 * bandaH);
  const h = Math.round(ch + 2 * bandaV);
  const x0 = seguro.izquierda + Math.round((anchoUtil - w * paginas) / 2);
  const y = Math.round(barraArriba + (altoUtil - h) / 2);
  const hoja = { x: x0 + (doble ? w : 0), y, w, h };
  return {
    modo: doble ? 'doble' : 'mesa',
    hoja,
    libro: { x: x0, y, w: w * paginas, h },
    caja: { x: bandaH, y: bandaV, w: w - 2 * bandaH, h: h - 2 * bandaV },
  };
}

/** Densidad con la que se dibujan las páginas: nítida, pero sin pasarse de memoria. */
export function densidad(dprPantalla: number, w: number, h: number, maxPixeles = 3.2e6) {
  const dpr = Math.min(dprPantalla || 1, 3);
  return Math.max(1, Math.min(dpr, Math.sqrt(maxPixeles / Math.max(1, w * h))));
}

/** Páginas de un pliego en doble página: la portada va sola a la derecha; luego izquierda y derecha. */
export function pliego(pagina: number) {
  const derecha = pagina % 2 === 0 ? pagina : pagina + 1;
  return { izquierda: derecha - 1, derecha };
}
