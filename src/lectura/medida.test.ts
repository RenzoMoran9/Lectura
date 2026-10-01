import { describe, expect, it } from 'vitest';
import { aOriginal, clave, esClaveMedida, lineasEnHoja, parteDe, rectsEnHoja, type Disposicion } from './medida';
import type { Hoja } from './reacomodo';

// Una línea de la página original (y = 100…110) con tres palabras, que en la hoja quedó partida en
// dos renglones nuevos; y la línea siguiente (y = 112…122), en el segundo renglón nuevo.
const pieza = (sx: number, sy: number, sw: number, x: number, y: number) => ({ sx, sy, sw, sh: 10, x, y, w: sw * 2, h: 20 });
const hoja: Hoja = {
  piezas: [pieza(10, 100, 30, 20, 50), pieza(45, 100, 20, 90, 50), pieza(70, 100, 25, 20, 80), pieza(10, 112, 30, 80, 80)],
};

describe('«A tu medida»: de la página original a la hoja', () => {
  it('numera las hojas aparte de las páginas', () => {
    expect(esClaveMedida(clave(0, 0))).toBe(true);
    expect(esClaveMedida(5)).toBe(false);
    expect(clave(2, 1)).not.toBe(clave(1, 2));
  });

  it('encuentra los trozos de una línea, sin tomar el borde de la línea vecina', () => {
    // La línea de arriba: sus tres palabras, aunque el rectángulo roce la de abajo.
    const trozos = rectsEnHoja(hoja, { x0: 0, y0: 99, x1: 100, y1: 113 });
    expect(trozos).toHaveLength(3);
    expect(trozos[0]).toEqual({ x: 20, y: 50, w: 60, h: 20 });
  });

  it('junta las palabras seguidas de un mismo renglón nuevo', () => {
    const lineas = lineasEnHoja(hoja, { x0: 0, y0: 100, x1: 100, y1: 110 });
    expect(lineas).toEqual([
      { x: 20, y: 50, w: 110, h: 20 },
      { x: 20, y: 80, w: 50, h: 20 },
    ]);
  });

  it('sabe en qué hoja quedó una línea y lleva un toque a la página original', () => {
    const otra: Hoja = { piezas: [pieza(10, 200, 30, 20, 50)] };
    const d: Disposicion = { hojas: [hoja, otra], escala: 2, ancho: 300, alto: 400 };
    expect(parteDe(d, { x0: 0, y0: 198, x1: 100, y1: 212 })).toBe(1);
    expect(parteDe(d, { x0: 0, y0: 500, x1: 100, y1: 510 })).toBe(-1);
    // El medio de la primera palabra.
    expect(aOriginal(hoja, 50, 60)).toEqual({ u: 25, v: 105 });
    // Lejos de todo: nada.
    expect(aOriginal(hoja, 300, 600)).toBeNull();
  });
});
