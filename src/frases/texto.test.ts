import { describe, expect, it } from 'vitest';
import { simplificar } from './marcador';
import { tocaMarca } from './dibujo';
import type { Frase } from './modelo';
import { construirTexto, dentro, encerradas, enRecuadro, letraEn, seleccionar, textoEntre, type TrozoTexto } from './texto';

// Página de prueba: dos renglones de 12 pt con letras de 6 pt de ancho (fuente «monoespaciada»).
// Transformación de la vista a escala 1 de una página de 400 × 600: y hacia abajo.
const VISTA = [1, 0, 0, -1, 0, 600];
const medir = (t: string) => t.length;
const trozo = (str: string, x: number, yBase: number, eol = false): TrozoTexto => ({
  str,
  transform: [12, 0, 0, 12, x, 600 - yBase],
  width: str.length * 6,
  fontName: 'f1',
  hasEOL: eol,
});
const estilos = { f1: { fontFamily: 'serif', ascent: 0.8, descent: -0.2 } };
const pagina = construirTexto(
  [trozo('En un lugar de la Man-', 50, 100, true), trozo('cha, de cuyo nombre no', 50, 116, true), trozo('quiero acordarme.', 50, 132)],
  estilos,
  VISTA,
  medir,
);
const indice = (texto: string, desde = 0) => pagina.letras.findIndex((l, i) => i >= desde && l.c === texto);

describe('geometría del texto', () => {
  it('ubica cada letra en su renglón, con su caja', () => {
    expect(pagina.tieneTexto).toBe(true);
    const e = pagina.letras[0];
    expect(e.c).toBe('E');
    expect(e.x0).toBeCloseTo(50);
    expect(e.x1).toBeCloseTo(56);
    expect(e.top).toBeCloseTo(100 - 0.8 * 12);
    expect(e.bottom).toBeCloseTo(100 + 0.2 * 12);
    expect(new Set(pagina.letras.map((l) => l.linea))).toEqual(new Set([0, 1, 2]));
  });

  it('encuentra la letra bajo el dedo', () => {
    const i = letraEn(pagina, 50 + 6 * 3 + 2, 96, 5); // «u» de «un»
    expect(pagina.letras[i].c).toBe('u');
    expect(letraEn(pagina, 380, 300, 5)).toBe(-1);
  });

  it('la selección se ajusta a palabras completas y une los renglones sin el guion', () => {
    const a = indice('l'); // en «lugar»
    const b = indice('y'); // en «cuyo»
    const sel = seleccionar(pagina, a + 2, b + 1)!;
    expect(sel.texto).toBe('lugar de la Mancha, de cuyo');
    expect(sel.rects).toHaveLength(2);
  });

  it('una selección hacia atrás da lo mismo', () => {
    const a = indice('l');
    const b = indice('y');
    expect(seleccionar(pagina, b, a)!.texto).toBe(seleccionar(pagina, a, b)!.texto);
  });

  it('une el texto de varios renglones con espacios', () => {
    expect(textoEntre(pagina, 0, pagina.letras.length - 1)).toBe('En un lugar de la Mancha, de cuyo nombre no quiero acordarme.');
  });

  it('un círculo a lápiz toma las palabras de dentro, no las del renglón que corta', () => {
    // Óvalo alrededor de «cuyo nombre» (renglón 2, y≈112), que roza por abajo el renglón 3.
    const x0 = 50 + 6 * 8 - 3;
    const x1 = 50 + 6 * 19 + 3;
    const ovalo: [number, number][] = [];
    for (let k = 0; k < 40; k++) {
      const t = (k / 40) * Math.PI * 2;
      ovalo.push([(x0 + x1) / 2 + ((x1 - x0) / 2) * Math.cos(t), 112 + 14 * Math.sin(t)]);
    }
    expect(encerradas(pagina, ovalo)!.texto).toBe('cuyo nombre');
  });

  it('dentro() funciona con polígonos simples', () => {
    const cuadrado: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(dentro([5, 5], cuadrado)).toBe(true);
    expect(dentro([15, 5], cuadrado)).toBe(false);
  });

  it('una página sin texto (escaneada) lo dice', () => {
    expect(construirTexto([], estilos, VISTA, medir).tieneTexto).toBe(false);
  });
});

describe('marcas', () => {
  const base: Frase = { id: 'a', libroId: 'l', pagina: 0, tipo: 'resaltado', color: 'amarillo', texto: 'x', creada: 0 };

  it('el borrador toca un resaltado y un trazo de lápiz', () => {
    expect(tocaMarca({ ...base, rects: [[10, 10, 50, 12]] }, 30, 15, 2)).toBe(true);
    expect(tocaMarca({ ...base, rects: [[10, 10, 50, 12]] }, 30, 40, 2)).toBe(false);
    const lapiz: Frase = { ...base, tipo: 'encerrado', color: 'grafito', trazo: [[0, 0], [100, 0]] };
    expect(tocaMarca(lapiz, 50, 3, 4)).toBe(true);
    expect(tocaMarca(lapiz, 50, 9, 4)).toBe(false);
  });

  it('simplificar deja menos puntos pero conserva los extremos', () => {
    const pts: [number, number][] = Array.from({ length: 50 }, (_, i) => [i * 0.1, 0]);
    const s = simplificar(pts, 1);
    expect(s.length).toBeLessThan(10);
    expect(s[0]).toEqual([0, 0]);
    expect(s[s.length - 1][0]).toBeCloseTo(4.9);
  });
});

describe('recuadro (como una captura)', () => {
  it('toma todo lo que queda dentro, en orden, y junta la palabra cortada con guion', () => {
    expect(enRecuadro(pagina, [40, 85, 320, 50])?.texto).toBe('En un lugar de la Mancha, de cuyo nombre no quiero acordarme.');
    expect(enRecuadro(pagina, [40, 85, 320, 33])?.texto).toBe('En un lugar de la Mancha, de cuyo nombre no');
  });

  it('completa las palabras que el borde corta y, a media columna, toma solo lo de adentro', () => {
    const sel = enRecuadro(pagina, [90, 90, 70, 28])!;
    expect(sel.texto).toBe('lugar de la cuyo nombre');
    expect(sel.rects).toHaveLength(2);
  });

  it('sin letras adentro no hay frase', () => {
    expect(enRecuadro(pagina, [300, 300, 50, 50])).toBeNull();
  });
});
