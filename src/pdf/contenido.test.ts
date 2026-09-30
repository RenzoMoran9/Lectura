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

  it('un pie de página que sale del bloque (una dirección web con el número) no lo ensancha', () => {
    const manchas: [number, number, number, number, number][] = [];
    for (let y = 30; y < 160; y += 9) manchas.push([40, y, 180, y + 6, 40]); // renglones del cuerpo
    manchas.push([8, 180, 70, 184, 40], [95, 176, 110, 190, 40]); // «www.ejemplo.net» y el número, en un recuadro alto
    manchas.push([120, 20, 190, 23, 40]); // encabezado que sale por la derecha
    const c = bordesDeTinta(pagina(200, 200, 250, manchas), 200, 200)!;
    expect(c.x0).toBeCloseTo(0.2, 2);
    expect(c.x1).toBeCloseTo(0.9, 2);
  });

  it('un poema con varios renglones largos: los largos sí cuentan', () => {
    const manchas: [number, number, number, number, number][] = [];
    const largos = [100, 190, 120, 175, 95, 185, 110, 130, 190, 105, 150, 100, 180, 115, 125];
    largos.forEach((fin, i) => manchas.push([40, 30 + i * 9, fin, 36 + i * 9, 40]));
    const c = bordesDeTinta(pagina(200, 200, 250, manchas), 200, 200)!;
    expect(c.x1).toBeCloseTo(0.95, 2);
  });

  it('una página en blanco no tiene contenido', () => {
    expect(bordesDeTinta(pagina(100, 100, 255, []), 100, 100)).toBeNull();
  });
});
