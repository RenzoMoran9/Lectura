import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pasador } from './pasador';

describe('pasar la hoja con el dedo', () => {
  let resultados: boolean[];
  let p: Pasador;
  beforeEach(() => {
    // Sin navegador: los cuadros de la animación van cada 16 ms con el reloj falso.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => setTimeout(() => f(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    resultados = [];
    p = new Pasador({ tamano: () => ({ w: 360, h: 800 }), puede: () => true, alCambiar: () => {}, alTerminar: (_s, paso) => resultados.push(paso) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Arrastra hacia la izquierda `pasos` tramos de `px`, con `ms` entre cada uno, y suelta tras `espera` ms. */
  const arrastrar = (pasos: number, px: number, ms: number, espera: number) => {
    p.bajar(330, 400, 1);
    for (let i = 1; i <= pasos; i++) {
      vi.advanceTimersByTime(ms);
      p.mover(330 - i * px, 400, 1);
    }
    vi.advanceTimersByTime(espera);
    p.subir(330 - pasos * px, 400, 1);
    vi.advanceTimersByTime(1500);
  };

  it('un gesto rápido y corto pasa la hoja, aunque no llegue a la mitad', () => {
    arrastrar(6, 13, 12, 8);
    expect(resultados).toEqual([true]);
  });

  it('un arrastre lento y corto no la pasa: regresa', () => {
    arrastrar(6, 13, 70, 10);
    expect(resultados).toEqual([false]);
  });

  it('si el dedo se detiene antes de soltar, tampoco: cuenta dónde quedó', () => {
    arrastrar(6, 13, 12, 250);
    expect(resultados).toEqual([false]);
  });

  it('arrastrada más allá de la mitad, cae aunque sea despacio', () => {
    arrastrar(14, 13, 70, 10);
    expect(resultados).toEqual([true]);
  });

  it('un toque no pasa la hoja', () => {
    p.bajar(330, 400, 1);
    vi.advanceTimersByTime(80);
    p.subir(331, 400, 1);
    vi.advanceTimersByTime(1500);
    expect(resultados).toEqual([]);
  });
});
