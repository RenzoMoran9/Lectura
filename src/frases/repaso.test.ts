import { describe, expect, it } from 'vitest';
import type { Frase } from './modelo';
import { delDia, responder, sumarRacha, tocaHoy } from './repaso';

const DIA = 864e5;
const hoy = new Date(2026, 9, 1, 10).getTime();
const frase = (id: string, extra: Partial<Frase> = {}): Frase => ({
  id,
  libroId: 'l',
  pagina: 0,
  tipo: 'resaltado',
  color: 'amarillo',
  texto: 'Una frase',
  creada: hoy - 3 * DIA,
  ...extra,
});

describe('repaso del día', () => {
  it('las nuevas tocan desde el día siguiente; las repasadas, cuando les toca', () => {
    expect(tocaHoy(frase('a', { creada: hoy - 3600e3 }), hoy)).toBe(false); // guardada hoy
    expect(tocaHoy(frase('b'), hoy)).toBe(true);
    expect(tocaHoy(frase('c', { repaso: { caja: 2, proxima: hoy + 3 * DIA } }), hoy)).toBe(false);
    expect(tocaHoy(frase('d', { repaso: { caja: 2, proxima: hoy - DIA } }), hoy)).toBe(true);
    expect(tocaHoy(frase('e', { texto: '' }), hoy)).toBe(false); // sin texto ni recorte
  });

  it('primero las atrasadas, luego las nuevas, y no más de 10', () => {
    const lista = [
      frase('nueva', { creada: hoy - 5 * DIA }),
      frase('atrasada', { repaso: { caja: 1, proxima: hoy - 4 * DIA } }),
      frase('hoy', { repaso: { caja: 1, proxima: hoy } }),
      ...Array.from({ length: 12 }, (_, i) => frase(`n${i}`)),
    ];
    const d = delDia(lista, hoy);
    expect(d.slice(0, 3).map((f) => f.id)).toEqual(['atrasada', 'hoy', 'nueva']);
    expect(d).toHaveLength(10);
  });

  it('la recordaba: cada vez más espaciada; no la recordaba: mañana', () => {
    const r1 = responder(frase('a'), true, hoy);
    expect(r1.caja).toBe(1);
    expect(Math.round((r1.proxima - hoy) / DIA)).toBe(3);
    const r3 = responder(frase('a', { repaso: { caja: 2, proxima: hoy } }), true, hoy);
    expect(r3.caja).toBe(3);
    expect(Math.round((r3.proxima - hoy) / DIA)).toBe(14);
    const no = responder(frase('a', { repaso: { caja: 4, proxima: hoy } }), false, hoy);
    expect(no).toMatchObject({ caja: 0 });
    expect(Math.round((no.proxima - hoy) / DIA)).toBe(1);
  });

  it('la racha sigue si ayer también repasé', () => {
    const ayer = sumarRacha(undefined, hoy - DIA);
    expect(ayer.dias).toBe(1);
    expect(sumarRacha(ayer, hoy).dias).toBe(2);
    expect(sumarRacha(sumarRacha(ayer, hoy), hoy).dias).toBe(2); // el mismo día no suma
    expect(sumarRacha(ayer, hoy + 2 * DIA).dias).toBe(1); // se cortó
  });
});
