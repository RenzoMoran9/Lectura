// Portadas originales desde internet: se buscan en Open Library y en Google Books por título y
// autor. Solo se elige sola si el resultado coincide con seguridad; si no, se ofrecen para elegir.

export interface Candidata {
  url: string;
  fuente: 'Open Library' | 'Google Books';
  titulo: string;
  autor: string;
  anio?: number;
}

const VACIAS = new Set(
  'el la los las lo un una unos unas de del al y e o u a en con por para su sus the of and an to in on edicion ed libro pdf ebook epub'.split(' '),
);

/** Palabras que importan de un texto: sin tildes, sin signos, sin artículos. */
export function palabras(texto: string): string[] {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((p) => p.length > 1 && !VACIAS.has(p) && !/^\d{4}$/.test(p));
}

/** Limpia títulos que vienen del nombre del archivo: «cien_anos_de_soledad (1).pdf» → «cien anos de soledad». */
export function limpiarTitulo(t: string): string {
  return t
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\((\d+|copia|copy)\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const proporcion = (a: string[], b: string[]) => (a.length ? a.filter((x) => b.includes(x)).length / a.length : 0);

// Libros sobre el libro (guías, resúmenes…): comparten el título, pero no son él.
const SOBRE_EL_LIBRO = new Set(
  'guia guias resumen resumenes analisis comentario comentarios estudio notas lectura critica ejercicios summary study guide notes workbook analysis sparknotes cliffsnotes'.split(' '),
);

/** ¿Es esta portada, con seguridad, la del libro? */
export function coincide(c: Pick<Candidata, 'titulo' | 'autor'>, titulo: string, autor: string): boolean {
  const qt = palabras(titulo);
  const qa = palabras(autor);
  const ct = palabras(c.titulo);
  const ca = palabras(c.autor);
  if (!qt.length || !ct.length) return false;
  if (ct.some((p) => SOBRE_EL_LIBRO.has(p) && !qt.includes(p))) return false;
  if (qa.length) {
    const tituloOk = proporcion(qt, ct) >= 0.7 && proporcion(ct, qt) >= 0.5;
    const autorOk = qa.some((p) => p.length > 2 && ca.includes(p));
    return tituloOk && autorOk;
  }
  // Sin autor, el título (que puede traer el autor pegado, como en muchos nombres de archivo)
  // debe contener el título de la portada, y casi todo lo buscado debe estar en título + autor.
  return proporcion(ct, qt) >= 0.8 && proporcion(qt, [...ct, ...ca]) >= 0.6;
}

async function traer(url: string, senal?: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { signal: senal });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function openLibrary(titulo: string, autor: string, senal?: AbortSignal): Promise<Candidata[]> {
  const campos = 'title,author_name,cover_i,first_publish_year';
  const q = autor
    ? `title=${encodeURIComponent(titulo)}&author=${encodeURIComponent(autor)}`
    : `q=${encodeURIComponent(titulo)}`;
  const datos = (await traer(`https://openlibrary.org/search.json?${q}&fields=${campos}&limit=12`, senal)) as {
    docs?: { title?: string; author_name?: string[]; cover_i?: number; first_publish_year?: number }[];
  };
  return (datos.docs ?? [])
    .filter((d) => d.cover_i)
    .map((d) => ({
      url: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg?default=false`,
      fuente: 'Open Library' as const,
      titulo: d.title ?? '',
      autor: (d.author_name ?? []).join(', '),
      anio: d.first_publish_year,
    }));
}

async function googleBooks(titulo: string, autor: string, senal?: AbortSignal): Promise<Candidata[]> {
  const q = autor ? `intitle:${titulo} inauthor:${autor}` : titulo;
  const datos = (await traer(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12&printType=books`, senal)) as {
    items?: { volumeInfo?: { title?: string; subtitle?: string; authors?: string[]; publishedDate?: string; imageLinks?: { thumbnail?: string } } }[];
  };
  return (datos.items ?? [])
    .map((i) => i.volumeInfo)
    .filter((v): v is NonNullable<typeof v> => !!v?.imageLinks?.thumbnail)
    .map((v) => ({
      // La miniatura se pide más grande y sin el doblez falso de la esquina.
      url: v.imageLinks!.thumbnail!.replace(/^http:/, 'https:').replace('&edge=curl', '') + '&fife=w600',
      fuente: 'Google Books' as const,
      titulo: v.title ?? '',
      autor: (v.authors ?? []).join(', '),
      anio: v.publishedDate ? parseInt(v.publishedDate, 10) || undefined : undefined,
    }));
}

/** Busca en los dos catálogos a la vez; las que coinciden van primero. */
export async function buscarPortadas(tituloBruto: string, autor: string, senal?: AbortSignal): Promise<Candidata[]> {
  const titulo = limpiarTitulo(tituloBruto);
  if (!titulo) return [];
  const [ol, gb] = await Promise.allSettled([openLibrary(titulo, autor, senal), googleBooks(titulo, autor, senal)]);
  const a = ol.status === 'fulfilled' ? ol.value : [];
  const b = gb.status === 'fulfilled' ? gb.value : [];
  if (ol.status === 'rejected' && gb.status === 'rejected') throw new Error('Sin conexión con los catálogos');
  // Intercaladas: así aparecen ediciones de los dos catálogos.
  const todas: Candidata[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) todas.push(a[i]);
    if (b[i]) todas.push(b[i]);
  }
  const vistas = new Set<string>();
  const unicas = todas.filter((c) => !vistas.has(c.url) && vistas.add(c.url));
  return unicas.sort((x, y) => Number(coincide(y, titulo, autor)) - Number(coincide(x, titulo, autor))).slice(0, 12);
}

/** Descarga la imagen para guardarla en el dispositivo (así se ve sin internet). */
export async function descargarPortada(url: string, senal?: AbortSignal): Promise<Blob | null> {
  try {
    const r = await fetch(url, { signal: senal, mode: 'cors' });
    if (!r.ok) return null;
    const b = await r.blob();
    // Menos de 2 KB suele ser una imagen vacía de «sin portada».
    return b.type.startsWith('image/') && b.size > 2000 ? b : null;
  } catch {
    return null;
  }
}

/** Las portadas de internet que coinciden con seguridad con el libro. Falla si no hay conexión. */
export async function portadasSeguras(titulo: string, autor: string, senal?: AbortSignal): Promise<Candidata[]> {
  const limpio = limpiarTitulo(titulo);
  return (await buscarPortadas(titulo, autor, senal)).filter((c) => coincide(c, limpio, autor));
}

export const CACHE_PORTADAS = 'entre-hojas-portadas';

/**
 * Trae la portada elegida para que se vea también sin internet. Si el sitio deja leerla, se guarda
 * la imagen junto al libro; si no, queda en la caché del navegador y se muestra desde su dirección.
 */
export async function traerPortada(url: string, senal?: AbortSignal): Promise<{ blob?: Blob; url: string } | null> {
  const blob = await descargarPortada(url, senal);
  if (blob) return { blob, url };
  try {
    const r = await fetch(url, { mode: 'no-cors', signal: senal });
    if (typeof caches !== 'undefined') await (await caches.open(CACHE_PORTADAS)).put(url, r);
    return { url };
  } catch {
    return null;
  }
}
