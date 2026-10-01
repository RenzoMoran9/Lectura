// Las frases: lo que resalto, encierro o capturo con un recuadro en un libro. Cada una guarda el texto, el libro, la página,
// la fecha, el color y la forma de la marca (en unidades de la página, para dibujarla siempre igual).

export type Herramienta = 'resaltador' | 'lapiz' | 'recuadro' | 'borrador';
export type ColorResaltador = 'amarillo' | 'verde' | 'rosa' | 'celeste' | 'naranja';
export type ColorLapiz = 'grafito' | 'rojo';
export type ColorMarca = ColorResaltador | ColorLapiz;

export const RESALTADORES: Record<ColorResaltador, { nombre: string; rgb: [number, number, number] }> = {
  amarillo: { nombre: 'Amarillo', rgb: [255, 212, 38] },
  verde: { nombre: 'Verde', rgb: [138, 212, 92] },
  rosa: { nombre: 'Rosa', rgb: [255, 136, 176] },
  celeste: { nombre: 'Celeste', rgb: [100, 188, 240] },
  naranja: { nombre: 'Naranja', rgb: [255, 158, 68] },
};

export const LAPICES: Record<ColorLapiz, { nombre: string; hex: string }> = {
  grafito: { nombre: 'Grafito', hex: '#4D453D' },
  rojo: { nombre: 'Rojo', hex: '#B3362B' },
};

export const COLORES_RESALTADOR = Object.keys(RESALTADORES) as ColorResaltador[];
export const COLORES_LAPIZ = Object.keys(LAPICES) as ColorLapiz[];

export const esLapiz = (c: ColorMarca): c is ColorLapiz => c in LAPICES;

/** Color de la marca como texto CSS «r,g,b» (para usar con rgba()). */
export function rgbDe(c: ColorMarca): string {
  if (esLapiz(c)) {
    const h = LAPICES[c].hex;
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
  }
  return RESALTADORES[c].rgb.join(',');
}

/** Punto o rectángulo en unidades de la página: puntos PDF, origen arriba a la izquierda. */
export type Punto = [number, number];
export type Rect = [x: number, y: number, w: number, h: number];

export interface Frase {
  id: string;
  libroId: string;
  libroTitulo?: string; // por si el libro se quita del estante
  pagina: number; // índice desde 0
  tipo: 'resaltado' | 'encerrado' | 'recuadro';
  color: ColorMarca;
  texto: string; // vacío si la página es escaneada
  imagen?: Blob | null; // recorte de la página, para PDFs sin texto
  rects?: Rect[]; // resaltado sobre texto: un rectángulo por renglón
  trazo?: Punto[]; // lápiz, o resaltado a mano en páginas escaneadas
  grosor?: number; // ancho del resaltado a mano, en unidades de la página
  caja?: Rect; // recuadro: la zona capturada (en la página quedan sus cuatro esquinas a lápiz)
  creada: number;
  /** Una nota corta mía sobre la frase (hasta 280 letras). */
  nota?: string;
  /** Repaso del día: en qué caja va (0 = recién guardada) y cuándo toca repasarla. */
  repaso?: { caja: number; proxima: number };
}

export const NOTA_MAX = 280;

export const nuevoId = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
