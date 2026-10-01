// Índice armado: cuando el PDF no trae índice (outline), se buscan los títulos en el texto de las
// páginas: renglones cortos con letra bastante más grande que la del cuerpo, o que empiezan con
// «Capítulo», «Parte», «Prólogo»… Los encabezados que se repiten en cada hoja no cuentan.

import type { Capitulo } from './indice';
import type { DocumentoPdf } from './pdf';

export interface LineaTexto {
  texto: string;
  /** Tamaño de la letra (puntos). */
  alto: number;
  /** Altura en la página, desde arriba (puntos). */
  y: number;
}

type Trozo = { str?: string; transform?: number[]; hasEOL?: boolean };

/** Los renglones de una página a partir de `getTextContent()`, con el tamaño de su letra. */
export function lineasDeTrozos(trozos: Trozo[], altoPagina: number): LineaTexto[] {
  const lineas: LineaTexto[] = [];
  let actual: LineaTexto | null = null;
  let finDeLinea = false;
  for (const t of trozos) {
    if (typeof t.str !== 'string' || !t.transform) continue;
    const [, , c, d, , f] = t.transform;
    const alto = Math.hypot(c, d);
    const y = altoPagina - f;
    if (!t.str.trim()) {
      if (t.hasEOL) finDeLinea = true;
      continue;
    }
    if (actual && !finDeLinea && Math.abs(y - actual.y) < Math.max(alto, actual.alto) * 0.5) {
      actual.texto += (/\s$/.test(actual.texto) || /^\s/.test(t.str) ? '' : ' ') + t.str;
      actual.alto = Math.max(actual.alto, alto);
    } else {
      actual = { texto: t.str, alto, y };
      lineas.push(actual);
    }
    finDeLinea = !!t.hasEOL;
  }
  for (const l of lineas) l.texto = l.texto.replace(/\s+/g, ' ').trim();
  return lineas.filter((l) => l.texto);
}

const PALABRA_CLAVE =
  /^(cap[ií]tulo|parte|libro|secci[oó]n|lecci[oó]n|pr[oó]logo|pr[eé]facio|presentaci[oó]n|introducci[oó]n|ep[ií]logo|conclusi[oó]n|ap[eé]ndice|anexo|agradecimientos|dedicatoria|bibliograf[ií]a|chapter|part|prologue|preface|introduction|epilogue|appendix)\b/i;

/** Un título en mayúsculas pasa a minúsculas con la primera en mayúscula («CAPÍTULO I» → «Capítulo I»). */
export function tituloLegible(t: string): string {
  // Sin la línea de puntos y el número de página de un índice impreso («Capítulo 3 ........ 45»).
  const s = t.replace(/\s+/g, ' ').replace(/\s*[.·…_]{3,}\s*\d+\s*$/, '').trim();
  // Cada parte por separado («CAPÍTULO 1 · Los sueños» → «Capítulo 1 · Los sueños»).
  return s
    .split(' · ')
    .map((parte) => {
      if (/\p{Ll}/u.test(parte) || parte.length < 4) return parte;
      return parte
        .toLowerCase()
        .replace(/^\p{L}/u, (c) => c.toUpperCase())
        .replace(/^((?:cap[ií]tulo|parte|libro|secci[oó]n)\s+)([ivxlcdm]+)\b/iu, (_, a: string, r: string) => a + r.toUpperCase());
    })
    .join(' · ');
}

const sinNumeros = (t: string) => t.toLowerCase().replace(/[\d\s.·…_-]+/g, ' ').trim();

/**
 * Elige los títulos de todas las páginas. `paginas` trae los renglones de cada una (en orden).
 * Primero se ve cuál es la letra del cuerpo (la que más texto tiene); luego se exige bastante más
 * grande, y si salen demasiados títulos (ruido), se exige un poco más.
 */
export function armarIndice(paginas: { indice: number; lineas: LineaTexto[] }[]): Capitulo[] {
  // La letra del cuerpo: el tamaño con más letras.
  const pesos = new Map<number, number>();
  for (const p of paginas) for (const l of p.lineas) pesos.set(Math.round(l.alto * 2) / 2, (pesos.get(Math.round(l.alto * 2) / 2) ?? 0) + l.texto.length);
  let cuerpo = 0;
  let mejor = -1;
  for (const [alto, n] of pesos) if (n > mejor) [cuerpo, mejor] = [alto, n];
  if (!cuerpo) return [];
  // Lo que se repite en muchas hojas (título del libro, autor, nombre del capítulo arriba) no es un título.
  const repeticiones = new Map<string, number>();
  for (const p of paginas) for (const t of new Set(p.lineas.map((l) => sinNumeros(l.texto)))) repeticiones.set(t, (repeticiones.get(t) ?? 0) + 1);
  const repetida = (t: string) => (repeticiones.get(sinNumeros(t)) ?? 0) > Math.max(3, paginas.length * 0.15);
  const letras = (t: string) => (t.match(/\p{L}/gu) ?? []).length;

  const elegir = (factor: number): Capitulo[] => {
    const capitulos: Capitulo[] = [];
    for (const p of paginas) {
      const candidatas = p.lineas
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => {
          if (letras(l.texto) < 2 || l.texto.length > 90 || repetida(l.texto)) return false;
          const grande = l.alto >= cuerpo * factor;
          const clave = PALABRA_CLAVE.test(l.texto) && l.texto.length <= 60 && l.alto >= cuerpo * 0.95;
          return grande || clave;
        });
      // Muchos «títulos» en una hoja: es una lista (el índice impreso, una portada); no sirve.
      if (!candidatas.length || candidatas.length > 4) continue;
      // Dos renglones de título seguidos («CAPÍTULO 1» + «El comienzo») van juntos.
      const primera = candidatas[0];
      let titulo = primera.l.texto;
      const segunda = candidatas[1];
      if (segunda && segunda.i === primera.i + 1 && segunda.l.y - primera.l.y < primera.l.alto * 3) titulo = `${titulo} · ${segunda.l.texto}`;
      titulo = tituloLegible(titulo);
      if (titulo && capitulos[capitulos.length - 1]?.titulo !== titulo) capitulos.push({ titulo, pagina: p.indice });
    }
    return capitulos;
  };
  const maximo = Math.max(40, paginas.length * 0.25);
  for (const factor of [1.25, 1.45, 1.7, 2]) {
    const c = elegir(factor);
    if (c.length <= maximo) return c;
  }
  return [];
}

/** Recorre el libro entero (en segundo plano) y arma el índice. `null` si se canceló. */
export async function armarIndiceDoc(doc: DocumentoPdf, o: { alAvanzar?: (f: number) => void; seguir?: () => boolean } = {}): Promise<Capitulo[] | null> {
  const paginas: { indice: number; lineas: LineaTexto[] }[] = [];
  const n = doc.numPages;
  for (let i = 0; i < n; i++) {
    if (o.seguir && !o.seguir()) return null;
    try {
      const p = await doc.getPage(i + 1);
      const alto = p.getViewport({ scale: 1 }).height;
      const contenido = await p.getTextContent();
      paginas.push({ indice: i, lineas: lineasDeTrozos(contenido.items as Trozo[], alto) });
      p.cleanup();
    } catch {
      /* una página que no se puede leer se salta */
    }
    if (i % 8 === 7 || i === n - 1) {
      o.alAvanzar?.((i + 1) / n);
      await new Promise((ok) => setTimeout(ok, 0));
    }
  }
  return armarIndice(paginas);
}
