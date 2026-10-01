// Exportar Mis frases: un archivo de texto, agrupado por libro y ordenado por página, con la fecha,
// el color y la nota de cada frase. Se descarga en el dispositivo (no se comparte con nadie).

import { esLapiz, LAPICES, RESALTADORES, type Frase } from './modelo';

const fecha = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

const lapiz = (f: Frase) => (esLapiz(f.color) ? LAPICES[f.color].nombre : 'grafito').toLowerCase();
const marca = (f: Frase) =>
  f.tipo === 'encerrado'
    ? `encerrada con lápiz ${lapiz(f)}`
    : f.tipo === 'recuadro'
      ? `en un recuadro, lápiz ${lapiz(f)}`
      : `resaltada en ${(esLapiz(f.color) ? LAPICES[f.color].nombre : RESALTADORES[f.color].nombre).toLowerCase()}`;

export function textoParaExportar(
  frases: Frase[],
  libro: (id: string) => { titulo: string; autor?: string } | undefined,
  ahora = Date.now(),
): string {
  const grupos = new Map<string, Frase[]>();
  for (const f of frases) grupos.set(f.libroId, [...(grupos.get(f.libroId) ?? []), f]);
  const linea = '─'.repeat(40);
  const partes = [
    'MIS FRASES · Entre Hojas',
    `Exportadas el ${new Date(ahora).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })} · ${frases.length} ${frases.length === 1 ? 'frase' : 'frases'}`,
  ];
  for (const [id, fs] of grupos) {
    const l = libro(id);
    const titulo = l?.titulo ?? fs[0].libroTitulo ?? 'Libro';
    partes.push('', linea, titulo.toUpperCase(), ...(l?.autor ? [l.autor] : []), linea);
    for (const f of [...fs].sort((a, b) => a.pagina - b.pagina || a.creada - b.creada)) {
      const texto = f.texto.replace(/\s+/g, ' ').trim();
      partes.push('', texto ? `«${texto}»` : '[recorte de una página escaneada, sin texto]');
      partes.push(`   — pág. ${f.pagina + 1} · ${fecha(f.creada)} · ${marca(f)}`);
      if (f.nota?.trim()) partes.push(`   Nota: ${f.nota.trim()}`);
    }
  }
  return partes.join('\n') + '\n';
}

/** Descarga el texto como archivo. */
export function descargar(nombre: string, texto: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
