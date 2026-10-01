import { describe, expect, it } from 'vitest';
import type { Frase } from './modelo';
import { textoParaExportar } from './exportar';

const f = (extra: Partial<Frase>): Frase => ({ id: 'x', libroId: 'q', pagina: 0, tipo: 'resaltado', color: 'amarillo', texto: '', creada: new Date(2026, 8, 30).getTime(), ...extra });

describe('exportar mis frases', () => {
  it('agrupa por libro, ordena por página y pone color y nota', () => {
    const t = textoParaExportar(
      [
        f({ id: '1', pagina: 9, texto: 'la libertad, Sancho,\nes uno de los más preciosos dones', color: 'rosa', nota: 'Para el examen' }),
        f({ id: '2', pagina: 2, texto: 'En un lugar de la Mancha', tipo: 'encerrado', color: 'rojo' }),
        f({ id: '3', libroId: 'm', pagina: 42, texto: '', imagen: new Blob() }),
      ],
      (id) => (id === 'q' ? { titulo: 'Don Quijote de la Mancha', autor: 'Miguel de Cervantes' } : undefined),
      new Date(2026, 9, 1).getTime(),
    );
    expect(t).toContain('3 frases');
    expect(t).toContain('DON QUIJOTE DE LA MANCHA\nMiguel de Cervantes');
    expect(t.indexOf('En un lugar')).toBeLessThan(t.indexOf('la libertad')); // pág. 3 antes que pág. 10
    expect(t).toContain('«la libertad, Sancho, es uno de los más preciosos dones»');
    expect(t).toContain('— pág. 10 · ');
    expect(t).toContain('resaltada en rosa');
    expect(t).toContain('encerrada con lápiz rojo');
    expect(t).toContain('   Nota: Para el examen');
    expect(t).toContain('[recorte de una página escaneada, sin texto]');
  });
});
