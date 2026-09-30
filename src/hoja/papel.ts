// Los cuatro papeles. La textura se genera con ruido (feTurbulence de SVG), sin imágenes externas,
// igual que en la propuesta visual. Se usa en dos sitios: en la interfaz (fondos CSS) y como
// textura en WebGL, donde se multiplica con la página del PDF.

export type TipoPapel = 'blanco' | 'crema' | 'antiguo' | 'noche';

export const PAPELES: Record<TipoPapel, { nombre: string; color: string; tinta: string; nota: string }> = {
  blanco: { nombre: 'Blanco', color: '#FBFAF6', tinta: '#1E1B18', nota: 'limpio, casi sin grano' },
  crema: { nombre: 'Crema', color: '#F5EDDB', tinta: '#29221B', nota: 'el de siempre' },
  antiguo: { nombre: 'Antiguo', color: '#E7D3AA', tinta: '#3A2C1D', nota: 'amarillento, bordes tostados' },
  noche: { nombre: 'Noche', color: '#23201C', tinta: '#D6CCBA', nota: 'para leer a oscuras' },
};

export const TIPOS_PAPEL = Object.keys(PAPELES) as TipoPapel[];

type Capa = [freq: number | string, octavas: number, rgb: [number, number, number], a: number, sesgo: number, semilla: number];

const CAPAS: Record<string, Capa> = {
  grano: [0.9, 2, [0.3, 0.23, 0.15], 0.42, -0.17, 1],
  granoClaro: [0.9, 2, [0.85, 0.8, 0.7], 0.3, -0.12, 1],
  mancha: ['.005 .011', 4, [0.52, 0.37, 0.18], 0.5, -0.2, 7],
  fibra: ['.035 .55', 2, [0.4, 0.31, 0.2], 0.28, -0.11, 3],
};

/** De abajo hacia arriba, como las capas CSS de la maqueta. */
const CAPAS_POR_PAPEL: Record<TipoPapel, (keyof typeof CAPAS)[]> = {
  blanco: ['grano'],
  crema: ['mancha', 'grano', 'fibra'],
  antiguo: ['mancha', 'mancha', 'grano', 'fibra'],
  noche: ['granoClaro'],
};

function svgRuido(tam: number, [freq, oct, [r, g, b], a, sesgo, semilla]: Capa): string {
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${tam}' height='${tam}'>` +
    `<filter id='n' x='0' y='0' width='100%' height='100%'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oct}' seed='${semilla}' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${a} 0 0 0 ${sesgo}'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#n)'/></svg>`
  );
}

const urlCss = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** Variables CSS con los ruidos, para los fondos de la interfaz (como en la maqueta). */
export function instalarTexturasCss() {
  const raiz = document.documentElement.style;
  raiz.setProperty('--grano', urlCss(svgRuido(220, CAPAS.grano)));
  raiz.setProperty('--grano-claro', urlCss(svgRuido(220, CAPAS.granoClaro)));
  raiz.setProperty('--mancha', urlCss(svgRuido(700, CAPAS.mancha)));
  raiz.setProperty('--fibra', urlCss(svgRuido(420, CAPAS.fibra)));
}

function cargarSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      mal(new Error('No se pudo generar la textura del papel'));
    };
    img.src = url;
  });
}

/** Grano de repuesto, por si el navegador no deja dibujar el SVG en un lienzo. */
function granoSimple(ctx: CanvasRenderingContext2D, tam: number, claro: boolean) {
  const datos = ctx.getImageData(0, 0, tam, tam);
  const p = datos.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = (Math.random() - 0.5) * (claro ? 10 : 14);
    p[i] += r;
    p[i + 1] += r;
    p[i + 2] += r;
  }
  ctx.putImageData(datos, 0, 0);
}

const cacheTexturas = new Map<TipoPapel, Promise<HTMLCanvasElement>>();

/** Baldosa de papel de `tam`×`tam` px que se repite sin costuras. */
export function texturaPapel(tipo: TipoPapel, tam = 1024): Promise<HTMLCanvasElement> {
  let prometida = cacheTexturas.get(tipo);
  if (!prometida) {
    prometida = generar(tipo, tam);
    cacheTexturas.set(tipo, prometida);
  }
  return prometida;
}

function lienzoBase(tipo: TipoPapel, tam: number) {
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = tam;
  const ctx = lienzo.getContext('2d')!;
  ctx.fillStyle = PAPELES[tipo].color;
  ctx.fillRect(0, 0, tam, tam);
  return { lienzo, ctx };
}

async function generar(tipo: TipoPapel, tam: number): Promise<HTMLCanvasElement> {
  try {
    const { lienzo, ctx } = lienzoBase(tipo, tam);
    for (const capa of CAPAS_POR_PAPEL[tipo]) {
      const img = await cargarSvg(svgRuido(tam, CAPAS[capa]));
      ctx.drawImage(img, 0, 0, tam, tam);
    }
    ctx.getImageData(0, 0, 1, 1); // falla si el lienzo quedó «contaminado» y WebGL no podría usarlo
    return lienzo;
  } catch {
    const { lienzo, ctx } = lienzoBase(tipo, tam);
    granoSimple(ctx, tam, tipo === 'noche');
    return lienzo;
  }
}
