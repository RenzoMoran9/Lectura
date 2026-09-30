// Zoom de la hoja: la pantalla muestra (x, y) + z · lienzo (px CSS, y hacia abajo).

import type { Caja } from './maqueta';

export interface Zoom {
  z: number;
  x: number;
  y: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;
export const SIN_ZOOM: Zoom = { z: 1, x: 0, y: 0 };

/**
 * Deja el zoom dentro de lo razonable: entre 1 y 5, y sin que el libro se escape de la pantalla.
 * Si el libro ampliado no llena la pantalla en un eje, se queda centrado donde estaba sin zoom.
 */
export function limitar(zoom: Zoom, libro: Caja, vista: { w: number; h: number }): Zoom {
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom.z));
  const eje = (pos: number, inicio: number, largo: number, pantalla: number) => {
    const ancho = z * largo;
    if (ancho <= pantalla) {
      const centro = inicio + largo / 2;
      return centro - z * centro;
    }
    const min = pantalla - z * (inicio + largo);
    const max = -z * inicio;
    return Math.max(min, Math.min(max, pos));
  };
  // (+ 0 evita el «-0», que no cambia nada pero confunde al comparar)
  return { z, x: eje(zoom.x, libro.x, libro.w, vista.w) + 0, y: eje(zoom.y, libro.y, libro.h, vista.h) + 0 };
}

/** Cambia el zoom dejando quieto el punto de la pantalla (px, py). */
export function acercarEn(zoom: Zoom, nuevo: number, px: number, py: number): Zoom {
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nuevo));
  const cx = (px - zoom.x) / zoom.z;
  const cy = (py - zoom.y) / zoom.z;
  return { z, x: px - z * cx, y: py - z * cy };
}

/** Punto de la pantalla → punto del lienzo (sin zoom). */
export const aLienzo = (zoom: Zoom, px: number, py: number) => ({ x: (px - zoom.x) / zoom.z, y: (py - zoom.y) / zoom.z });

export const conZoom = (zoom: Zoom) => zoom.z > 1.01;

/** ¿La vista se puede mover? (con zoom, o porque la hoja es más alta que la pantalla, de lado). */
export const desplazable = (zoom: Zoom, libro: Caja, vista: { w: number; h: number }) =>
  conZoom(zoom) || libro.w > vista.w + 1 || libro.h > vista.h + 1;

export interface Encuadre {
  /** Lo impreso de la página, en px CSS del lienzo. */
  texto: Caja;
  /** Ancho que se deja entrar (px CSS del lienzo): el del texto o el típico del libro, el mayor. */
  ancho: number;
  /** Aire a los lados y arriba/abajo, en px de la pantalla. */
  margen: { lado: number; arriba: number; abajo: number };
}

/** Zoom con el que el texto ocupa todo el ancho de la pantalla, sin cortar nada a los lados. */
export function zoomAlTexto(e: Encuadre, vista: { w: number }) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (vista.w - 2 * e.margen.lado) / Math.max(1, e.ancho)));
}

/**
 * Coloca el texto con el zoom `z`: centrado a lo ancho y, a lo alto, entero si cabe; si no, desde
 * arriba (al pasar hacia adelante), desde abajo (al volver) o dejando quieto el punto tocado.
 */
export function encuadrar(z: number, e: Encuadre, vista: { w: number; h: number }, donde: 'arriba' | 'abajo' | { py: number; y: number }): Zoom {
  const { texto, margen } = e;
  const x = vista.w / 2 - z * (texto.x + texto.w / 2);
  const alto = vista.h - margen.arriba - margen.abajo;
  let y: number;
  if (z * texto.h <= alto) y = margen.arriba + (alto - z * texto.h) / 2 - z * texto.y;
  else if (donde === 'arriba') y = margen.arriba - z * texto.y;
  else if (donde === 'abajo') y = vista.h - margen.abajo - z * (texto.y + texto.h);
  else y = donde.py - z * donde.y;
  return { z, x, y };
}
