import { describe, expect, it } from 'vitest';
import { enPalabras, paraLeer, romano } from './numeros';

describe('números en palabras', () => {
  it('dice los números como se leen', () => {
    expect(enPalabras(0)).toBe('cero');
    expect(enPalabras(7)).toBe('siete');
    expect(enPalabras(16)).toBe('dieciséis');
    expect(enPalabras(21)).toBe('veintiuno');
    expect(enPalabras(45)).toBe('cuarenta y cinco');
    expect(enPalabras(100)).toBe('cien');
    expect(enPalabras(101)).toBe('ciento uno');
    expect(enPalabras(210)).toBe('doscientos diez');
    expect(enPalabras(1000)).toBe('mil');
    expect(enPalabras(1984)).toBe('mil novecientos ochenta y cuatro');
    expect(enPalabras(2026)).toBe('dos mil veintiséis');
    expect(enPalabras(21000)).toBe('veintiún mil');
    expect(enPalabras(1_000_000)).toBe('un millón');
    expect(enPalabras(3_500_001)).toBe('tres millones quinientos mil uno');
  });

  it('reconoce los romanos bien escritos', () => {
    expect(romano('IV')).toBe(4);
    expect(romano('XX')).toBe(20);
    expect(romano('MCMLXXXIV')).toBe(1984);
    expect(romano('IIII')).toBeNull();
    expect(romano('MIL')).toBeNull();
  });
});

describe('texto para leer en voz alta', () => {
  it('cambia números, abreviaturas, porcentajes y capítulos', () => {
    expect(paraLeer('Capítulo 3. En 1984 tenía 25 años y vivía en la calle 7, número 210.')).toBe(
      'Capítulo tres. En mil novecientos ochenta y cuatro tenía veinticinco años y vivía en la calle siete, número doscientos diez.',
    );
    expect(paraLeer('El Sr. Pérez y la Dra. Gómez, pág. 12.')).toBe('El señor Pérez y la doctora Gómez, página doce.');
    expect(paraLeer('CAPÍTULO IV. En el siglo XIX…')).toBe('CAPÍTULO cuatro. En el siglo diecinueve…');
    expect(paraLeer('Subió un 12,5 % y costó 1.500 pesos.')).toBe('Subió un doce coma cinco por ciento y costó mil quinientos pesos.');
    expect(paraLeer('Llegó 1.º y ella 2.ª')).toBe('Llegó primero y ella segunda');
  });

  it('no toca las palabras que parecen romanos', () => {
    expect(paraLeer('Dijo: «Vi a mi amigo».')).toBe('Dijo: «Vi a mi amigo».');
    expect(paraLeer('Capítulo primero')).toBe('Capítulo primero');
  });
});
