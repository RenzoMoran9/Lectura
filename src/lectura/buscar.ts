// Buscar en el libro: el texto de cada página (de la capa de texto de PDF.js) y las coincidencias,
// sin importar tildes, mayúsculas, espacios dobles ni las palabras cortadas con guion al final del
// renglón. Las posiciones se dan en el texto original, para mostrar el fragmento y marcarlo.

export interface Coincidencia {
  inicio: number;
  fin: number;
}

/** El texto de una página a partir de los trozos de `getTextContent()`. */
export function textoDeTrozos(trozos: { str?: string; hasEOL?: boolean }[]): string {
  return trozos.map((t) => (t.str ?? '') + (t.hasEOL ? '\n' : '')).join('');
}

/**
 * Texto para comparar: sin tildes, en minúsculas, con un solo espacio entre palabras y sin el
 * guion de corte de renglón. `origen[i]` dice de qué letra del texto original viene cada letra.
 */
export function normalizarConMapa(s: string): { texto: string; origen: number[] } {
  let texto = '';
  const origen: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    // «pala-\nbra» → «palabra»
    if (c === '-' && s[i + 1] === '\n' && /\p{Ll}/u.test(s[i + 2] ?? '')) {
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      if (texto.length && texto[texto.length - 1] !== ' ') {
        texto += ' ';
        origen.push(i);
      }
      continue;
    }
    const n = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const k of n) {
      texto += k;
      origen.push(i);
    }
  }
  return { texto, origen };
}

const limpiarConsulta = (q: string) => normalizarConMapa(q.trim()).texto;

/** Dónde aparece la consulta en el texto (posiciones del texto original). */
export function coincidencias(texto: string, consulta: string, max = 50): Coincidencia[] {
  const q = limpiarConsulta(consulta);
  if (q.length < 2) return [];
  const { texto: t, origen } = normalizarConMapa(texto);
  const res: Coincidencia[] = [];
  for (let i = t.indexOf(q); i >= 0 && res.length < max; i = t.indexOf(q, i + q.length)) {
    res.push({ inicio: origen[i], fin: origen[i + q.length - 1] + 1 });
  }
  return res;
}

/** Un fragmento alrededor de la coincidencia, cortado en palabras completas. */
export function fragmento(texto: string, c: Coincidencia, aire = 48) {
  const limpio = (s: string) => s.replace(/-\n(?=\p{Ll})/gu, '').replace(/\s+/g, ' ');
  let a = Math.max(0, c.inicio - aire);
  let b = Math.min(texto.length, c.fin + aire);
  if (a > 0) a = texto.indexOf(' ', a) + 1 || a;
  if (b < texto.length) b = texto.lastIndexOf(' ', b) > c.fin ? texto.lastIndexOf(' ', b) : b;
  return {
    antes: (a > 0 ? '…' : '') + limpio(texto.slice(a, c.inicio)).trimStart(),
    palabra: limpio(texto.slice(c.inicio, c.fin)),
    despues: limpio(texto.slice(c.fin, b)).trimEnd() + (b < texto.length ? '…' : ''),
  };
}
