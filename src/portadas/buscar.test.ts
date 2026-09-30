import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarPortadas, coincide, limpiarTitulo, palabras } from './buscar';

describe('portadas: comparar títulos', () => {
  it('las palabras que importan: sin tildes, signos ni artículos', () => {
    expect(palabras('Cien años de soledad (1967)')).toEqual(['cien', 'anos', 'soledad']);
    expect(palabras('El ingenioso hidalgo Don Quijote de la Mancha')).toEqual(['ingenioso', 'hidalgo', 'don', 'quijote', 'mancha']);
  });

  it('limpia los títulos que vienen del nombre del archivo', () => {
    expect(limpiarTitulo('cien_anos_de_soledad (1).pdf')).toBe('cien anos de soledad');
    expect(limpiarTitulo('Rayuela [ePub r1.2] (copia)')).toBe('Rayuela');
  });

  it('con autor: título y autor tienen que coincidir', () => {
    const c = { titulo: 'Cien años de soledad', autor: 'Gabriel García Márquez' };
    expect(coincide(c, 'Cien anos de soledad', 'Gabriel Garcia Marquez')).toBe(true);
    expect(coincide(c, 'Cien años de soledad', 'Mario Vargas Llosa')).toBe(false);
    expect(coincide({ titulo: 'Cien años de soledad: guía de lectura para estudiantes', autor: 'Gabriel García Márquez' }, 'Cien años de soledad', 'García Márquez')).toBe(false);
  });

  it('sin autor: sirve el nombre de archivo con el autor pegado', () => {
    const c = { titulo: 'Rayuela', autor: 'Julio Cortázar' };
    expect(coincide(c, 'Julio Cortazar - Rayuela', '')).toBe(true);
    expect(coincide(c, 'Rayuela', '')).toBe(true);
    expect(coincide({ titulo: 'Rayuela', autor: 'Julio Cortázar' }, 'Libro de Manuel', '')).toBe(false);
    expect(coincide({ titulo: '', autor: '' }, 'Rayuela', '')).toBe(false);
  });
});

describe('portadas: buscar en los catálogos', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('junta Open Library y Google Books, con las que coinciden primero', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const json = url.includes('openlibrary')
        ? { docs: [{ title: 'Otro libro', author_name: ['X'], cover_i: 1 }, { title: 'Rayuela', author_name: ['Julio Cortázar'], cover_i: 2, first_publish_year: 1963 }, { title: 'Rayuela' }] }
        : { items: [{ volumeInfo: { title: 'Rayuela', authors: ['Julio Cortázar'], publishedDate: '2004-05', imageLinks: { thumbnail: 'http://books.google.com/books/content?id=a&zoom=1&edge=curl' } } }] };
      return new Response(JSON.stringify(json), { status: 200 });
    });
    const r = await buscarPortadas('Rayuela.pdf', 'Julio Cortázar');
    expect(r.map((c) => c.fuente)).toEqual(['Google Books', 'Open Library', 'Open Library']);
    expect(r[0].url).toBe('https://books.google.com/books/content?id=a&zoom=1&fife=w600');
    expect(r[0].anio).toBe(2004);
    expect(r[1].url).toBe('https://covers.openlibrary.org/b/id/2-L.jpg?default=false');
    expect(r[2].titulo).toBe('Otro libro');
  });

  it('sin conexión con ninguno de los dos, avisa', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(buscarPortadas('Rayuela', '')).rejects.toThrow();
  });
});
