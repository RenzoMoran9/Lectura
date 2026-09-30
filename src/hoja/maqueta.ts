// Dónde va la hoja en la pantalla y dónde cabe la página del PDF dentro de ella.
//  - Celular (vertical): la hoja ocupa toda la pantalla; el lomo es el borde izquierdo.
//  - Pantalla ancha: una hoja con la forma de la página, centrada sobre la mesa.
// La página del PDF se ajusta entera dentro de la caja, sin recortarla ni deformarla.

export interface Margenes {
  arriba: number;
  abajo: number;
  izquierda: number;
  derecha: number;
}

export interface Disposicion {
  modo: 'celular' | 'mesa';
  hoja: { x: number; y: number; w: number; h: number };
  caja: { x: number; y: number; w: number; h: number };
}

export function disponer(ancho: number, alto: number, seguro: Margenes, aspecto: number): Disposicion {
  const celular = ancho / alto < 0.9 || ancho < 560;
  if (celular) {
    const arriba = seguro.arriba + 30;
    const abajo = seguro.abajo + 30;
    const lado = 6;
    return {
      modo: 'celular',
      hoja: { x: 0, y: 0, w: ancho, h: alto },
      caja: {
        x: lado + seguro.izquierda,
        y: arriba,
        w: Math.max(50, ancho - 2 * lado - seguro.izquierda - seguro.derecha),
        h: Math.max(50, alto - arriba - abajo),
      },
    };
  }
  const margen = 26;
  const bandaV = 34;
  const bandaH = 30;
  const altoUtil = alto - 2 * margen - seguro.arriba - seguro.abajo;
  let ch = altoUtil - 2 * bandaV;
  let cw = ch * aspecto;
  const anchoMax = ancho - 2 * margen - seguro.izquierda - seguro.derecha - 2 * bandaH;
  if (cw > anchoMax) {
    cw = anchoMax;
    ch = cw / aspecto;
  }
  const w = Math.round(cw + 2 * bandaH);
  const h = Math.round(ch + 2 * bandaV);
  return {
    modo: 'mesa',
    hoja: {
      x: Math.round((ancho - w) / 2),
      y: Math.round(seguro.arriba + (alto - seguro.arriba - seguro.abajo - h) / 2),
      w,
      h,
    },
    caja: { x: bandaH, y: bandaV, w: w - 2 * bandaH, h: h - 2 * bandaV },
  };
}

/** Densidad con la que se dibujan las páginas: nítida, pero sin pasarse de memoria. */
export function densidad(dprPantalla: number, w: number, h: number, maxPixeles = 3.2e6) {
  const dpr = Math.min(dprPantalla || 1, 3);
  return Math.max(1, Math.min(dpr, Math.sqrt(maxPixeles / Math.max(1, w * h))));
}
