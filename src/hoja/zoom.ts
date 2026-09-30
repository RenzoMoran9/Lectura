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
