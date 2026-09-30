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
 * dejan los escáneres y las motas sueltas. A lo ancho manda el cuerpo del texto: uno o dos renglones
 * que se salen de él (encabezados, pies con una dirección web, números de página) no lo ensanchan.
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
  const tinta = (x: number, y: number) => Math.abs(brillo[y * ancho + x] - fondo) > 26;
  const columnas = new Float32Array(ancho);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) if (tinta(x, y)) columnas[x]++;
  for (let x = 0; x < ancho; x++) columnas[x] /= alto;
  // Franjas casi negras en los bordes (sombra del escáner o del lomo): no son texto.
  let a = 0;
  let b = ancho - 1;
  while (a < ancho * 0.15 && columnas[a] > 0.5) a++;
  while (b > ancho * 0.85 && columnas[b] > 0.5) b--;

  // Renglones: filas seguidas con tinta. De cada uno, su alto y dónde empieza y termina.
  const minimo = Math.max(2, Math.round((b - a) * 0.004));
  const renglones: { arriba: number; abajo: number; izq: number; der: number }[] = [];
  let actual: (typeof renglones)[number] | null = null;
  for (let y = 0; y < alto; y++) {
    let cuenta = 0;
    let izq = -1;
    let der = -1;
    for (let x = a; x <= b; x++) {
      if (!tinta(x, y)) continue;
      cuenta++;
      if (izq < 0) izq = x;
      der = x;
    }
    if (cuenta >= minimo) {
      if (actual) {
        actual.abajo = y + 1;
        actual.izq = Math.min(actual.izq, izq);
        actual.der = Math.max(actual.der, der + 1);
      } else renglones.push((actual = { arriba: y, abajo: y + 1, izq, der: der + 1 }));
    } else actual = null;
  }
  // Las motas sueltas (una o dos filas) no cuentan.
  const reales = renglones.filter((r) => r.abajo - r.arriba >= 2);
  if (!reales.length) return null;
  // A lo ancho manda el margen del cuerpo del texto. Uno o dos renglones que se salen de él (una
  // dirección web al pie, un número de página en el margen) no lo ensanchan; si se salen muchos
  // (un poema de renglones largos, una tabla), sí cuentan.
  const aire = 0.03 * ancho;
  const pocos = Math.max(2, Math.floor(reales.length * 0.08));
  const percentil = (v: number[], p: number) => [...v].sort((m, k) => m - k)[Math.min(v.length - 1, Math.floor(p * v.length))];
  const margenIzq = percentil(reales.map((r) => r.izq), 0.2) - aire;
  const margenDer = percentil(reales.map((r) => r.der), 0.8) + aire;
  const fueraIzq = reales.filter((r) => r.izq < margenIzq).length;
  const fueraDer = reales.filter((r) => r.der > margenDer).length;
  const x0 = Math.min(...reales.filter((r) => fueraIzq > pocos || r.izq >= margenIzq).map((r) => r.izq));
  const x1 = Math.max(...reales.filter((r) => fueraDer > pocos || r.der <= margenDer).map((r) => r.der));
  const y0 = reales[0].arriba;
  const y1 = reales[reales.length - 1].abajo;
  return { x0: x0 / ancho, x1: x1 / ancho, y0: y0 / alto, y1: y1 / alto };
}

/** Mide lo impreso de la zona (px del lienzo) donde se dibujó la página. */
export function medirContenido(lienzo: HTMLCanvasElement, x: number, y: number, w: number, h: number): Contenido | null {
  if (w < 4 || h < 4) return null;
  const ancho = 400;
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
