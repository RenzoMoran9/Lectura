import { describe, expect, it } from 'vitest';
import { avance, calcularDoblez, doblarPunto, pasaLaHoja, posicionPasada, radioMaximo, restringir } from './geometria';
import { densidad, disponer } from './maqueta';

const W = 390;
const H = 844;
const R = radioMaximo(W, H);
const cerca = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('la hoja sigue al dedo', () => {
  it('el punto que tomó el dedo cae exactamente bajo el dedo', () => {
    const P = { x: 360, y: 80 };
    for (const dedo of [
      { x: 350, y: 82 },
      { x: 300, y: 120 },
      { x: 200, y: 160 },
      { x: 60, y: 200 },
      { x: 5, y: 90 },
    ]) {
      const F = restringir(P, dedo, H);
      const doblado = doblarPunto(P, calcularDoblez(P, F, H, R));
      cerca(doblado.x, F.x);
      cerca(doblado.y, F.y);
    }
  });

  it('sin moverse, la hoja está plana', () => {
    const P = { x: 300, y: 300 };
    expect(calcularDoblez(P, P, H, R)).toBeNull();
  });

  it('no se puede arrastrar hacia la derecha de donde se tomó', () => {
    const P = { x: 300, y: 300 };
    const F = restringir(P, { x: 380, y: 300 }, H);
    expect(F.x).toBeLessThanOrEqual(P.x);
  });

  it('la hoja no se despega del lomo: sus extremos se quedan en su sitio', () => {
    const P = { x: 370, y: 40 };
    for (const dedo of [
      { x: -500, y: 900 },
      { x: -300, y: -400 },
      { x: 10, y: 800 },
      { x: 100, y: -200 },
    ]) {
      const F = restringir(P, dedo, H);
      const dob = calcularDoblez(P, F, H, R);
      for (const s of [
        { x: 0, y: 0 },
        { x: 0, y: H },
      ]) {
        const q = doblarPunto(s, dob);
        cerca(q.x, s.x, 0.5);
        cerca(q.y, s.y, 0.5);
        expect(q.z).toBeLessThan(0.7);
      }
    }
  });

  it('el rollo nunca se hace más grande que el radio máximo', () => {
    const P = { x: 370, y: 40 };
    const dob = calcularDoblez(P, restringir(P, { x: 150, y: 90 }, H), H, R)!;
    expect(dob.r).toBeGreaterThan(0);
    expect(dob.r).toBeLessThanOrEqual(R);
  });

  it('pasada del todo, la hoja queda plana del otro lado del lomo', () => {
    const P = { x: 370, y: 40 };
    const F = restringir(P, posicionPasada(P), H);
    const dob = calcularDoblez(P, F, H, R)!;
    cerca(dob.r, 0, 1e-6);
    const esquina = doblarPunto({ x: W, y: H }, dob);
    cerca(esquina.x, -W, 0.5);
  });
});

describe('antes de la mitad regresa; pasada la mitad, cae', () => {
  it('adelante: cuenta el recorrido del dedo hasta el borde', () => {
    const P = { x: 360, y: 80 };
    expect(pasaLaHoja(avance('adelante', P, { x: 250, y: 80 }))).toBe(false);
    expect(pasaLaHoja(avance('adelante', P, { x: 185, y: 80 }))).toBe(false);
    expect(pasaLaHoja(avance('adelante', P, { x: 175, y: 80 }))).toBe(true);
    expect(pasaLaHoja(avance('adelante', P, { x: 20, y: 80 }))).toBe(true);
  });

  it('atrás: la hoja anterior tiene que volver más de la mitad', () => {
    const P = { x: W, y: 80 };
    expect(avance('atras', P, posicionPasada(P))).toBe(0);
    expect(pasaLaHoja(avance('atras', P, { x: -20, y: 80 }))).toBe(false);
    expect(pasaLaHoja(avance('atras', P, { x: 20, y: 80 }))).toBe(true);
    expect(avance('atras', P, P)).toBe(1);
  });
});

describe('disposición en pantalla', () => {
  it('en el celular la hoja ocupa toda la pantalla y la página cabe entera', () => {
    const d = disponer(W, H, { arriba: 47, abajo: 34, izquierda: 0, derecha: 0 }, 0.7);
    expect(d.modo).toBe('celular');
    expect(d.hoja).toEqual({ x: 0, y: 0, w: W, h: H });
    expect(d.caja.y).toBeGreaterThanOrEqual(47);
    expect(d.caja.y + d.caja.h).toBeLessThanOrEqual(H - 34);
  });

  it('en pantalla ancha la hoja tiene la forma de la página y va centrada', () => {
    const d = disponer(1440, 900, { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 }, 0.7);
    expect(d.modo).toBe('mesa');
    cerca(d.caja.w / d.caja.h, 0.7, 0.01);
    cerca(d.hoja.x + d.hoja.w / 2, 720, 1);
  });

  it('la densidad no pasa del límite de memoria', () => {
    const dpr = densidad(3, 1024, 1366);
    expect(1024 * 1366 * dpr * dpr).toBeLessThanOrEqual(3.2e6 + 1);
    expect(densidad(2, 390, 844)).toBe(2);
  });
});
