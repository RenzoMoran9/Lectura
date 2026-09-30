import { describe, expect, it } from 'vitest';
import type { Letra, TextoPagina } from '../frases/texto';
import { falta, limitesCapitulo, marcaDesdeTexto, marcaSinTexto, sumarAlRitmo, tiempoLegible, tocaMarca } from './lugar';

/** Página de prueba: cada renglón es una lista de palabras; cada letra mide 5 × 10 puntos. */
function pagina(renglones: string[]): TextoPagina {
  const letras: Letra[] = [];
  renglones.forEach((r, linea) => {
    [...r].forEach((c, k) => letras.push({ c, x0: 50 + k * 5, x1: 55 + k * 5, top: 100 + linea * 14, bottom: 110 + linea * 14, linea }));
    letras.push({ c: '\n', x0: 0, x1: 0, top: 0, bottom: 0, linea, virtual: true });
  });
  return { letras, tieneTexto: true };
}

describe('el marcador de lectura', () => {
  const t = pagina(['En un lugar de la Mancha, de cuyo', 'nombre no quiero acordarme, no ha']);

  it('marca desde la palabra tocada hasta el final del renglón', () => {
    const i = t.letras.findIndex((l) => l.c === 'g'); // «lugar», en medio de la palabra
    const m = marcaDesdeTexto(t, i, 500, 800, 7)!;
    expect(m.pagina).toBe(7);
    expect(m.x0 * 500).toBeCloseTo(50 + 6 * 5); // empieza en la «l» de «lugar»
    expect(m.x1 * 500).toBeCloseTo(55 + 32 * 5); // termina en la última letra del renglón
    expect(m.y0 * 800).toBeCloseTo(100);
    expect(m.y1 * 800).toBeCloseTo(110);
    expect(m.texto).toBe('lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha');
  });

  it('en una página escaneada, la línea va a la altura del dedo', () => {
    const m = marcaSinTexto(0.3, 0.5, 0.9, 2);
    expect(m.y0).toBeLessThan(0.5);
    expect(m.y1).toBeGreaterThan(0.5);
    expect(m.x1).toBe(0.9);
    expect(tocaMarca(m, 0.4, 0.5)).toBe(true);
    expect(tocaMarca(m, 0.4, 0.6)).toBe(false);
  });
});

describe('cuánto falta', () => {
  const caps = [
    { titulo: 'Uno', pagina: 0 },
    { titulo: 'Dos', pagina: 10 },
    { titulo: 'Tres', pagina: 30 },
  ];

  it('los límites del capítulo en el que voy', () => {
    expect(limitesCapitulo(caps, 12, 50)).toMatchObject({ indice: 1, inicio: 10, fin: 30 });
    expect(limitesCapitulo(caps, 40, 50)).toMatchObject({ indice: 2, fin: 50 });
    expect(limitesCapitulo([], 3, 50)).toBeNull();
  });

  it('el ritmo ignora los saltos rápidos y las pausas largas', () => {
    let r = sumarAlRitmo(undefined, 60);
    r = sumarAlRitmo(r, 2); // salto rápido
    r = sumarAlRitmo(r, 3000); // se fue a hacer otra cosa
    r = sumarAlRitmo(r, 80);
    expect(r).toEqual({ seg: 70, n: 2 });
  });

  it('con pocas páginas medidas no se calcula; luego sí', () => {
    expect(falta({ seg: 60, n: 2 }, caps, 12, 50)).toBeNull();
    const f = falta({ seg: 60, n: 8 }, caps, 12, 50)!;
    expect(f.capitulo).toBe(17.5 * 60);
    expect(f.libro).toBe(37.5 * 60);
    expect(falta({ seg: 60, n: 8 }, caps, 40, 50)!.capitulo).toBeNull(); // último capítulo
  });

  it('se lee en español', () => {
    expect(tiempoLegible(20)).toBe('menos de 1 min');
    expect(tiempoLegible(8 * 60)).toBe('8 min');
    expect(tiempoLegible(190 * 60)).toBe('3 h 10 min');
    expect(tiempoLegible(120 * 60)).toBe('2 h');
  });
});
