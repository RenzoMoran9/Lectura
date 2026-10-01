import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { construirTexto, type TrozoTexto } from '../frases/texto';
import {
  LecturaEnVoz,
  Narrador,
  nombresVoces,
  nombreVoz,
  oracionDesdeAltura,
  oracionEn,
  oraciones,
  vocesEnEspanol,
  type EstadoVoz,
  type Sintesis,
  type VozInfo,
} from './voz';

// Página de prueba de 400 × 600 con letras de 6 pt de ancho y renglones de 16 pt.
const VISTA = [1, 0, 0, -1, 0, 600];
const medir = (t: string) => t.length;
const estilos = { f1: { fontFamily: 'serif', ascent: 0.8, descent: -0.2 } };
const trozo = (str: string, x: number, yBase: number, alto = 12): TrozoTexto => ({
  str,
  transform: [alto, 0, 0, alto, x, 600 - yBase],
  width: str.length * (alto / 2),
  fontName: 'f1',
  hasEOL: true,
});
/** Renglones seguidos (cada 16 pt), o [texto, altura de la base, alto de la letra]. */
const pagina = (renglones: (string | [string, number, number?])[]) =>
  construirTexto(
    renglones.map((r, i) => (typeof r === 'string' ? trozo(r, 50, 100 + i * 16) : trozo(r[0], 50, r[1], r[2]))),
    estilos,
    VISTA,
    medir,
  );

describe('oraciones para leer en voz alta', () => {
  it('corta en el punto, une los renglones y quita el guion de las palabras cortadas', () => {
    const t = pagina(['En un lugar de la Man-', 'cha, de cuyo nombre no quiero', 'acordarme. No ha mucho tiempo que', 'vivía un hidalgo. ¿Quién era?', '—Nadie lo sabe.']);
    expect(oraciones(t).map((o) => o.texto)).toEqual([
      'En un lugar de la Mancha, de cuyo nombre no quiero acordarme.',
      'No ha mucho tiempo que vivía un hidalgo.',
      '¿Quién era?',
      '—Nadie lo sabe.',
    ]);
  });

  it('no corta en abreviaturas ni en iniciales', () => {
    const t = pagina(['El Sr. Pérez vio a J. R. Tolkien en la pág. 4 del libro. Luego se fue.']);
    expect(oraciones(t).map((o) => o.texto)).toEqual(['El Sr. Pérez vio a J. R. Tolkien en la pág. 4 del libro.', 'Luego se fue.']);
  });

  it('deja los títulos aparte y salta los números de página', () => {
    const t = pagina([
      ['1. Capítulo uno', 100],
      ['Sueños de destino', 140],
      ['Todos tenemos sueños y todos queremos creer en', 180],
      ['algo. Fin.', 196],
      ['8', 560],
    ]);
    expect(oraciones(t).map((o) => o.texto)).toEqual(['1. Capítulo uno', 'Sueños de destino', 'Todos tenemos sueños y todos queremos creer en algo.', 'Fin.']);
  });

  it('salta los encabezados cortos en letra chica', () => {
    const t = pagina([
      ['Libro de prueba', 60, 7],
      ['La casa estaba sola. Nadie la cuidaba desde hacía años.', 100],
    ]);
    expect(oraciones(t).map((o) => o.texto)).toEqual(['La casa estaba sola.', 'Nadie la cuidaba desde hacía años.']);
  });

  it('parte las oraciones muy largas en una coma', () => {
    const larga = 'Era una tarde tranquila, con el sol bajando sobre los cerros, y nadie en el pueblo pensaba en lo que vendría después de la tormenta.';
    const t = pagina([larga]);
    const ors = oraciones(t, 70);
    expect(ors.length).toBeGreaterThan(1);
    expect(ors.every((o) => o.texto.length <= 70)).toBe(true);
    expect(ors[0].texto.endsWith(',')).toBe(true);
    expect(ors.map((o) => o.texto).join(' ')).toBe(larga);
  });

  it('encuentra la oración de una letra y la primera a la vista', () => {
    const t = pagina(['Primera oración. Segunda oración,', 'que sigue aquí. Tercera.', 'Cuarta en otro renglón.']);
    const ors = oraciones(t);
    expect(ors.map((o) => o.texto)).toEqual(['Primera oración.', 'Segunda oración, que sigue aquí.', 'Tercera.', 'Cuarta en otro renglón.']);
    const s = t.letras.findIndex((l) => l.c === 'S');
    expect(oracionEn(ors, s + 3)).toBe(1);
    // A la altura del tercer renglón (y = 132 − 9,6 ≈ 122 de 600).
    expect(oracionDesdeAltura(t, ors, 600, 0.2)).toBe(3);
  });
});

describe('voces', () => {
  const v = (name: string, lang: string, extra: Partial<VozInfo> = {}): VozInfo => ({ voiceURI: name, name, lang, localService: true, default: false, ...extra });

  it('ordena las voces en español: mi país, Latinoamérica y España', () => {
    const voces = [v('Mónica', 'es-ES'), v('Samantha', 'en-US'), v('Paulina', 'es-MX'), v('Google español de Estados Unidos', 'es-US', { localService: false }), v('Perú', 'es-PE')];
    expect(vocesEnEspanol(voces, 'es-PE').map((x) => x.name)).toEqual(['Perú', 'Paulina', 'Google español de Estados Unidos', 'Mónica']);
  });

  it('da nombres cortos', () => {
    expect(nombreVoz(v('Paulina', 'es-MX'))).toBe('Paulina (México)');
    expect(nombreVoz(v('Microsoft Sabina - Spanish (Mexico)', 'es-MX'))).toBe('Sabina (México)');
    expect(nombreVoz(v('Google español de Estados Unidos', 'es-US'))).toBe('Google (EE. UU.)');
    expect(nombreVoz(v('es-us-x-sfb-local', 'es_US'))).toBe('Voz (EE. UU.)');
    expect(nombresVoces([v('es-us-x-a', 'es-US'), v('es-us-x-b', 'es-US')])).toEqual(['Voz (EE. UU.)', 'Voz 2 (EE. UU.)']);
  });
});

/** Una voz falsa: cada texto «termina» cuando la prueba lo dice. */
class SintesisFalsa implements Sintesis {
  dichos: string[] = [];
  actual: SpeechSynthesisUtterance | null = null;
  speaking = false;
  pending = false;
  speak(u: SpeechSynthesisUtterance) {
    if (u.text.trim()) {
      this.dichos.push(u.text);
      this.actual = u;
      this.speaking = true;
    }
  }
  cancel() {
    this.actual = null;
    this.speaking = false;
  }
  pause() {}
  resume() {}
  terminar() {
    const u = this.actual;
    this.actual = null;
    this.speaking = false;
    u?.onend?.({} as SpeechSynthesisEvent);
  }
}
class EnunciadoFalso {
  lang = '';
  rate = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: ((e: SpeechSynthesisEvent) => void) | null = null;
  onerror: ((e: SpeechSynthesisErrorEvent) => void) | null = null;
  constructor(public text: string) {}
}

describe('leer en voz alta', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const libro = [
    pagina(['Primera página. Dos oraciones.']),
    pagina(['Segunda página.']),
    pagina(['Tercera y última.']),
  ];

  const preparar = (opciones: { visibles?: () => number[] } = {}) => {
    const s = new SintesisFalsa();
    let actual = 0;
    const estados: (EstadoVoz | null)[] = [];
    const avisos: string[] = [];
    const lectura: LecturaEnVoz = new LecturaEnVoz({
      texto: async (i) => ({ texto: libro[i], ancho: 400, alto: 600 }),
      visibles: opciones.visibles ?? (() => [actual]),
      total: () => libro.length,
      pasar: () => {
        // La hoja pasa: la página cambia y el lector avisa.
        actual++;
        queueMicrotask(() => lectura.cambioDePagina());
      },
      voz: () => undefined,
      velocidad: () => 1.2,
      alCambiar: (e) => estados.push(e),
      alAviso: (t) => avisos.push(t),
      narrador: new Narrador(s, EnunciadoFalso as unknown as typeof SpeechSynthesisUtterance),
    });
    return { s, lectura, estados, avisos, pagina: () => actual };
  };

  it('lee oración por oración, pasa la hoja sola y termina al final del libro', async () => {
    const { s, lectura, estados, avisos, pagina: actual } = preparar();
    lectura.empezar(0);
    await vi.runOnlyPendingTimersAsync();
    expect(s.dichos).toEqual(['Primera página.']);
    expect(estados.at(-1)?.fase).toBe('leyendo');
    expect(estados.at(-1)?.rangos.length).toBe(1);
    s.terminar();
    expect(s.dichos.at(-1)).toBe('Dos oraciones.');
    s.terminar();
    await vi.runOnlyPendingTimersAsync();
    expect(actual()).toBe(1);
    expect(s.dichos.at(-1)).toBe('Segunda página.');
    s.terminar();
    await vi.runOnlyPendingTimersAsync();
    s.terminar();
    await vi.runOnlyPendingTimersAsync();
    expect(s.dichos).toEqual(['Primera página.', 'Dos oraciones.', 'Segunda página.', 'Tercera y última.']);
    expect(avisos).toEqual(['Fin del libro']);
    expect(estados.at(-1)).toBeNull();
  });

  it('en pausa calla, y al seguir repite la oración', async () => {
    const { s, lectura, estados } = preparar();
    lectura.empezar(0);
    await vi.runOnlyPendingTimersAsync();
    lectura.pausar();
    expect(s.speaking).toBe(false);
    expect(estados.at(-1)?.fase).toBe('pausa');
    lectura.seguir();
    await vi.runOnlyPendingTimersAsync();
    expect(s.dichos).toEqual(['Primera página.', 'Primera página.']);
  });

  it('si paso la hoja yo, sigue leyendo desde arriba de la nueva', async () => {
    const { s, lectura } = preparar();
    lectura.empezar(0);
    await vi.runOnlyPendingTimersAsync();
    // Salto a la tercera página (por ejemplo, desde el índice).
    const visibles = [2];
    (lectura as unknown as { o: { visibles: () => number[] } }).o.visibles = () => visibles;
    lectura.cambioDePagina();
    await vi.runOnlyPendingTimersAsync();
    expect(s.dichos.at(-1)).toBe('Tercera y última.');
  });

  it('en doble página sigue con la de la derecha sin pasar la hoja', async () => {
    const { s, lectura, pagina: actual } = preparar({ visibles: () => [0, 1] });
    lectura.empezar(0);
    await vi.runOnlyPendingTimersAsync();
    s.terminar();
    s.terminar();
    await vi.runOnlyPendingTimersAsync();
    expect(s.dichos.at(-1)).toBe('Segunda página.');
    expect(actual()).toBe(0);
  });

  it('avisa si la página no tiene texto', async () => {
    const { lectura, avisos, estados } = preparar();
    (lectura as unknown as { o: { texto: () => Promise<null> } }).o.texto = async () => null;
    lectura.empezar(0);
    await vi.runOnlyPendingTimersAsync();
    expect(avisos[0]).toMatch(/no tiene texto/);
    expect(estados.at(-1)).toBeNull();
  });
});
