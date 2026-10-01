import { describe, expect, it } from 'vitest';
import { conPuntos, palabrasDe, textoBonito } from './tarjeta';

describe('el texto de la tarjeta, bien escrito', () => {
  it('deja la frase completa como está', () => {
    expect(textoBonito('Cada uno es artífice de su ventura.')).toBe('Cada uno es artífice de su ventura.');
  });

  it('marca con puntos suspensivos lo que empieza o termina a mitad de oración', () => {
    expect(textoBonito('partes de su hacienda. El resto della concluían sayo')).toBe('…partes de su hacienda. El resto della concluían sayo…');
    expect(textoBonito('La libertad, Sancho, es uno de los más preciosos dones,')).toBe('La libertad, Sancho, es uno de los más preciosos dones…');
  });

  it('quita la letra suelta de una capitular y junta las letras espaciadas', () => {
    expect(textoBonito('n un lugar de la Mancha, de cuyo nombre no quiero acordarme')).toBe('…un lugar de la Mancha, de cuyo nombre no quiero acordarme…');
    expect(textoBonito('C A P Í T U L O  P R I M E R O Que trata de la condición')).toBe('CAPÍTULO PRIMERO Que trata de la condición…');
  });

  it('junta las palabras cortadas al final del renglón', () => {
    expect(textoBonito('Yo sé quién soy, respondió don Qui- jote.')).toBe('Yo sé quién soy, respondió don Quijote.');
    expect(textoBonito('el que lee mucho y anda mu- cho, ve mucho y sabe mucho.')).toBe('…el que lee mucho y anda mucho, ve mucho y sabe mucho.');
  });

  it('no toca las palabras de una letra', () => {
    expect(textoBonito('y a la mañana siguiente se fue.')).toBe('…y a la mañana siguiente se fue.');
  });

  it('las palabras para borrar y el texto que queda', () => {
    const p = palabrasDe('partes de su hacienda. El resto della concluían sayo');
    expect(p).toHaveLength(9);
    expect(conPuntos(p.slice(4).join(' '))).toBe('El resto della concluían sayo…');
    expect(conPuntos(p.slice(0, 4).join(' '))).toBe('…partes de su hacienda.');
  });
});
