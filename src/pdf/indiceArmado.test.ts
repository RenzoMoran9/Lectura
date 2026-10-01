import { describe, expect, it } from 'vitest';
import { armarIndice, lineasDeTrozos, tituloLegible, type LineaTexto } from './indiceArmado';

const pagina = (indice: number, lineas: [texto: string, alto: number][]) => ({
  indice,
  lineas: lineas.map(([texto, alto], i): LineaTexto => ({ texto, alto, y: 60 + i * 16 })),
});
const cuerpo = (n: number): [string, number][] => Array.from({ length: n }, (_, i) => [`Este es un renglón del cuerpo del libro, número ${i}, con su texto.`, 11]);

describe('índice armado (cuando el PDF no trae uno)', () => {
  it('junta los trozos de un renglón y mide su letra', () => {
    const lineas = lineasDeTrozos(
      [
        { str: 'CAPÍTULO', transform: [18, 0, 0, 18, 100, 700] },
        { str: 'PRIMERO', transform: [18, 0, 0, 18, 200, 700], hasEOL: true },
        { str: 'En un lugar', transform: [11, 0, 0, 11, 72, 650] },
      ],
      842,
    );
    expect(lineas).toEqual([
      { texto: 'CAPÍTULO PRIMERO', alto: 18, y: 142 },
      { texto: 'En un lugar', alto: 11, y: 192 },
    ]);
  });

  it('encuentra los títulos de letra grande y los que empiezan con «Capítulo»', () => {
    const paginas = [
      pagina(0, [['Despertando al gigante interior', 9], ...cuerpo(30)]),
      pagina(1, [['Despertando al gigante interior', 9], ['PRÓLOGO', 16], ...cuerpo(25)]),
      pagina(2, [['Despertando al gigante interior', 9], ...cuerpo(30)]),
      pagina(3, [['Despertando al gigante interior', 9], ['CAPÍTULO 1', 16], ['Los sueños del destino', 16], ...cuerpo(24)]),
      pagina(4, [['Despertando al gigante interior', 9], ...cuerpo(30)]),
      pagina(5, [['Despertando al gigante interior', 9], ['Capítulo 2. Decisiones', 11], ...cuerpo(28)]),
      pagina(6, [['Despertando al gigante interior', 9], ...cuerpo(30)]),
    ];
    expect(armarIndice(paginas)).toEqual([
      { titulo: 'Prólogo', pagina: 1 },
      { titulo: 'Capítulo 1 · Los sueños del destino', pagina: 3 },
      { titulo: 'Capítulo 2. Decisiones', pagina: 5 },
    ]);
  });

  it('no toma como títulos el encabezado que se repite ni una hoja llena de títulos', () => {
    const paginas = [
      pagina(0, [['ÍNDICE', 16], ['Uno', 14], ['Dos', 14], ['Tres', 14], ['Cuatro', 14], ['Cinco', 14]]),
      ...Array.from({ length: 8 }, (_, i) => pagina(i + 1, [['EL LIBRO GRANDE', 15], ...cuerpo(30)])),
    ];
    expect(armarIndice(paginas)).toEqual([]);
  });

  it('deja los títulos legibles', () => {
    expect(tituloLegible('CAPÍTULO IV')).toBe('Capítulo IV');
    expect(tituloLegible('Capítulo 3 ............ 45')).toBe('Capítulo 3');
    expect(tituloLegible('LAS MIL NOCHES')).toBe('Las mil noches');
  });
});
