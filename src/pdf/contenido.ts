// Dónde está el texto (o lo impreso) dentro de cada página: para acercar la página hasta que el
// texto ocupe todo el ancho de la pantalla, sin cortar nada a los lados. El PDF no se toca: solo se
// mira la página ya dibujada, en pequeño.

/** Rectángulo de lo impreso, en fracciones de la página (0..1, desde arriba a la izquierda). */
export interface Contenido {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Busca los bordes de lo impreso en una imagen en escala de grises (brillo 0..255).
 * El fondo es el brillo más común (la mediana); se saltan las franjas oscuras de los bordes que
 * dejan los escáneres y las motas sueltas.
 */
export function bordesDeTinta(brillo: ArrayLike<number>, ancho: number, alto: number): Contenido | null {
  const n = ancho * alto;
  if (!n) return null;
  const histograma = new Uint32Array(256);
  for (let i = 0; i < n; i++) histograma[brillo[i] | 0]++;
  let fondo = 255;
  for (let v = 0, acumulado = 0; v < 256; v++) {
    acumulado += histograma[v];
    if (acumulado >= n / 2) {
      fondo = v;
      break;
    }
  }
  const columnas = new Float32Array(ancho);
  const filas = new Float32Array(alto);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (Math.abs(brillo[y * ancho + x] - fondo) > 26) {
        columnas[x]++;
        filas[y]++;
      }
    }
  }
  for (let x = 0; x < ancho; x++) columnas[x] /= alto;
  for (let y = 0; y < alto; y++) filas[y] /= ancho;
  const limites = (p: Float32Array, largo: number): [number, number] | null => {
    let a = 0;
    let b = largo - 1;
    // Franjas casi negras en los bordes (sombra del escáner o del lomo): no son texto.
    while (a < largo * 0.15 && p[a] > 0.5) a++;
    while (b > largo * 0.85 && p[b] > 0.5) b--;
    const umbral = 0.012;
    while (a <= b && p[a] < umbral) a++;
    while (b >= a && p[b] < umbral) b--;
    return a <= b ? [a, b + 1] : null;
  };
  const x = limites(columnas, ancho);
  const y = limites(filas, alto);
  if (!x || !y) return null;
  return { x0: x[0] / ancho, x1: x[1] / ancho, y0: y[0] / alto, y1: y[1] / alto };
}

/** Mide lo impreso de la zona (px del lienzo) donde se dibujó la página. */
export function medirContenido(lienzo: HTMLCanvasElement, x: number, y: number, w: number, h: number): Contenido | null {
  if (w < 4 || h < 4) return null;
  const ancho = 240;
  const alto = Math.max(4, Math.round((ancho * h) / w));
  const chico = document.createElement('canvas');
  chico.width = ancho;
  chico.height = alto;
  const ctx = chico.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(lienzo, x, y, w, h, 0, 0, ancho, alto);
  const datos = ctx.getImageData(0, 0, ancho, alto).data;
  const brillo = new Uint8Array(ancho * alto);
  for (let i = 0, j = 0; i < brillo.length; i++, j += 4) brillo[i] = (datos[j] * 299 + datos[j + 1] * 587 + datos[j + 2] * 114) / 1000;
  const c = bordesDeTinta(brillo, ancho, alto);
  if (!c) return null;
  // Un poco de aire alrededor, para que las letras del borde no queden pegadas a la pantalla.
  const aire = 1 / ancho;
  return { x0: Math.max(0, c.x0 - aire), y0: Math.max(0, c.y0 - aire), x1: Math.min(1, c.x1 + aire), y1: Math.min(1, c.y1 + aire) };
}
