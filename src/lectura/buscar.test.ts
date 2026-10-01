import { describe, expect, it } from 'vitest';
import { coincidencias, fragmento, normalizarConMapa, textoDeTrozos } from './buscar';

describe('buscar en el libro', () => {
  it('el texto de la página respeta los saltos de renglón', () => {
    expect(textoDeTrozos([{ str: 'En un lugar', hasEOL: true }, { str: 'de la Mancha' }])).toBe('En un lugar\nde la Mancha');
  });

  it('sin tildes ni mayúsculas, y con un solo espacio', () => {
    expect(normalizarConMapa('Canción  DEL  Ánimo').texto).toBe('cancion del animo');
  });

  it('encuentra aunque la palabra esté cortada con guion al final del renglón', () => {
    const t = 'Era un gi-\ngante enorme';
    const [c] = coincidencias(t, 'gigante');
    expect(t.slice(c.inicio, c.fin)).toBe('gi-\ngante');
  });

  it('da las posiciones en el texto original', () => {
    const t = 'El Gigante y el gigante; el GIGANTE.';
    const cs = coincidencias(t, 'gigante');
    expect(cs).toHaveLength(3);
    expect(cs.map((c) => t.slice(c.inicio, c.fin))).toEqual(['Gigante', 'gigante', 'GIGANTE']);
    expect(coincidencias(t, 'canción del ánimo')).toEqual([]);
    expect(coincidencias(t, 'g')).toEqual([]); // muy corta
  });

  it('el fragmento corta en palabras y marca la coincidencia', () => {
    const t = 'Todos tenemos sueños. Todos queremos creer, en lo más profundo de nuestras almas, que poseemos un don especial.';
    const [c] = coincidencias(t, 'profundo');
    const f = fragmento(t, c, 20);
    expect(f.palabra).toBe('profundo');
    expect(f.antes.startsWith('…')).toBe(true);
    expect(f.despues.endsWith('…')).toBe(true);
    expect(`${f.antes}${f.palabra}${f.despues}`).toContain('en lo más profundo de nuestras');
  });
});
