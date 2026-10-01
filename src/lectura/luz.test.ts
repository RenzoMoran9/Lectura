import { describe, expect, it } from 'vitest';
import { luzActual, luzDeLaHora } from './luz';

describe('luz del papel', () => {
  it('de día no cambia nada', () => {
    expect(luzDeLaHora(10)).toEqual({ brillo: 1, tibieza: 0 });
    expect(luzDeLaHora(17.5)).toEqual({ brillo: 1, tibieza: 0 });
  });

  it('de noche, cálida y algo tenue; al atardecer, a medias', () => {
    const noche = luzDeLaHora(23);
    expect(noche.tibieza).toBeCloseTo(0.75);
    expect(noche.brillo).toBeCloseTo(0.82);
    expect(luzDeLaHora(3).tibieza).toBeCloseTo(0.75);
    const tarde = luzDeLaHora(20);
    expect(tarde.tibieza).toBeGreaterThan(0.2);
    expect(tarde.tibieza).toBeLessThan(0.6);
  });

  it('a mano manda lo elegido', () => {
    expect(luzActual({ luzAuto: false, brillo: 0.9, tibieza: 0.3 }, new Date(2026, 0, 1, 23))).toEqual({ brillo: 0.9, tibieza: 0.3 });
  });
});
