import { describe, expect, it } from 'vitest';
import { maquetar, parrafosDe, renglonesDeImagen, sinMargenes } from './reacomodo';

/** Una «página» en grises: fondo blanco y bloques negros (letras) donde se pide. */
function pagina(ancho: number, alto: number, bloques: [x: number, y: number, w: number, h: number][]) {
  const g = new Uint8Array(ancho * alto).fill(255);
  for (const [x, y, w, h] of bloques) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j * ancho + i] = 20;
  return g;
}

// Renglones de 10 px de alto; letras de 7 px separadas 1 px, palabras separadas 6 px o más.
const palabra = (x: number, y: number, letras: number) => Array.from({ length: letras }, (_, i) => [x + i * 8, y, 7, 10] as [number, number, number, number]);
const g = pagina(200, 120, [
  [90, 2, 20, 6], // encabezado: chico y lejos del texto
  ...palabra(10, 40, 5),
  ...palabra(60, 40, 4),
  ...palabra(100, 40, 6),
  ...palabra(10, 56, 3),
  ...palabra(40, 56, 7),
  ...palabra(10, 72, 6),
]);

describe('reacomodar los renglones al ancho del celular', () => {
  const renglones = renglonesDeImagen(g, 200, 120, 1);

  it('encuentra los renglones y las palabras en la imagen', () => {
    expect(renglones).toHaveLength(4);
    expect(renglones.slice(1).map((r) => r.palabras.length)).toEqual([3, 2, 1]);
    expect(renglones[1].palabras[1]).toMatchObject({ x0: 60, x1: 91 });
  });

  it('quita el encabezado suelto y deja el cuerpo', () => {
    expect(sinMargenes(renglones)).toHaveLength(3);
  });

  it('acomoda las palabras en renglones más cortos, sin pasarse del ancho', () => {
    const { hojas, escala } = maquetar(parrafosDe(sinMargenes(renglones)), { ancho: 120, alto: 400, margenX: 10, margenArriba: 10, margenAbajo: 10, letra: 20 });
    expect(escala).toBeCloseTo(2);
    const piezas = hojas.flatMap((h) => h.piezas);
    expect(piezas).toHaveLength(6);
    for (const p of piezas) expect(p.x + p.w).toBeLessThanOrEqual(110 + 0.01);
    // Más renglones que en la página original (los renglones nuevos son más cortos).
    expect(new Set(piezas.map((p) => Math.round(p.y))).size).toBeGreaterThan(3);
  });
});
