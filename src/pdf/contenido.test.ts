import { describe, expect, it } from 'vitest';
import { bordesDeTinta } from './contenido';

/** Página de prueba: fondo claro y rectángulos de «texto» oscuros. */
function pagina(ancho: number, alto: number, fondo: number, manchas: [number, number, number, number, number][]) {
  const b = new Uint8Array(ancho * alto).fill(fondo);
  for (const [x0, y0, x1, y1, v] of manchas) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) b[y * ancho + x] = v;
  return b;
}

describe('dónde está el texto de la página', () => {
  it('encuentra el bloque de texto y deja fuera los márgenes', () => {
    const renglones: [number, number, number, number, number][] = [];
    for (let y = 30; y < 170; y += 8) renglones.push([20, y, 180, y + 3, 40]);
    const c = bordesDeTinta(pagina(200, 200, 250, renglones), 200, 200)!;
    expect(c.x0).toBeCloseTo(0.1, 2);
    expect(c.x1).toBeCloseTo(0.9, 2);
    expect(c.y0).toBeCloseTo(0.15, 2);
    expect(c.y1).toBeLessThanOrEqual(0.86);
  });

  it('en un escaneo gris, ignora la sombra negra del borde y las motas sueltas', () => {
    const b = pagina(200, 200, 200, [
      [0, 0, 8, 200, 10], // sombra del lomo
      [40, 40, 160, 150, 60], // texto
      [190, 10, 191, 11, 0], // mota
    ]);
    const c = bordesDeTinta(b, 200, 200)!;
    expect(c.x0).toBeCloseTo(0.2, 2);
    expect(c.x1).toBeCloseTo(0.8, 2);
  });

  it('una página en blanco no tiene contenido', () => {
    expect(bordesDeTinta(pagina(100, 100, 255, []), 100, 100)).toBeNull();
  });
});
