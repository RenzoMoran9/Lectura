// Capítulos del libro, a partir del índice (outline) del PDF, si lo tiene.

import type { DocumentoPdf } from './pdf';

export interface Capitulo {
  titulo: string;
  pagina: number; // índice desde 0
}

type Nodo = { title: string; dest: unknown; items?: Nodo[] };

export async function leerCapitulos(doc: DocumentoPdf, profundidad = 2): Promise<Capitulo[]> {
  let raiz: Nodo[] | null = null;
  try {
    raiz = (await doc.getOutline()) as Nodo[] | null;
  } catch {
    return [];
  }
  if (!raiz?.length) return [];
  const capitulos: Capitulo[] = [];
  const recorrer = async (nodos: Nodo[], nivel: number) => {
    for (const n of nodos) {
      const pagina = await paginaDe(doc, n.dest);
      const titulo = (n.title ?? '').replace(/\s+/g, ' ').trim();
      if (pagina !== null && titulo) capitulos.push({ titulo, pagina });
      if (n.items?.length && nivel < profundidad) await recorrer(n.items, nivel + 1);
    }
  };
  await recorrer(raiz, 1);
  return capitulos.sort((a, b) => a.pagina - b.pagina);
}

async function paginaDe(doc: DocumentoPdf, dest: unknown): Promise<number | null> {
  try {
    const d = typeof dest === 'string' ? await doc.getDestination(dest) : (dest as unknown[] | null);
    const ref = d?.[0];
    if (ref == null) return null;
    if (typeof ref === 'number') return ref;
    return await doc.getPageIndex(ref as Parameters<DocumentoPdf['getPageIndex']>[0]);
  } catch {
    return null;
  }
}

/** El capítulo en el que está una página (el último que empieza antes o en ella). */
export function capituloDe(capitulos: Capitulo[], pagina: number): string | undefined {
  let actual: string | undefined;
  for (const c of capitulos) {
    if (c.pagina <= pagina) actual = c.titulo;
    else break;
  }
  return actual;
}
