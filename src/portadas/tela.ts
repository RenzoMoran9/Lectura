// «Portada de tela»: una portada hecha por la app con el título y el autor, al estilo de la propuesta
// visual (tela de color, letras doradas o claras). Para libros sin portada o con una que no gusta.

export const ESTILOS_TELA = [
  { nombre: 'Granate', fondo: '#7B2530', tinta: '#E2C27A' },
  { nombre: 'Verde', fondo: '#2E4A3B', tinta: '#EFE6CF' },
  { nombre: 'Negro', fondo: '#1E1C1A', tinta: '#EDE6D6' },
  { nombre: 'Azul', fondo: '#233650', tinta: '#E9E1CC' },
] as const;

const ANCHO = 480;
const ALTO = 700;

function partirEnRenglones(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const renglones: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && actual) {
      renglones.push(actual);
      actual = p;
    } else actual = prueba;
  }
  if (actual) renglones.push(actual);
  return renglones;
}

/** Dibuja la portada y la devuelve como JPEG. `estilo` es el índice en ESTILOS_TELA. */
export async function portadaDeTela(titulo: string, autor: string, estilo: number): Promise<Blob> {
  await Promise.all(['600 40px Fraunces', 'italic 400 40px Fraunces', '600 20px "DM Sans"'].map((f) => document.fonts.load(f).catch(() => null)));
  const e = ESTILOS_TELA[((estilo % ESTILOS_TELA.length) + ESTILOS_TELA.length) % ESTILOS_TELA.length];
  const c = document.createElement('canvas');
  c.width = ANCHO;
  c.height = ALTO;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = e.fondo;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  // Trama de la tela: puntitos de luz y sombra.
  const datos = ctx.getImageData(0, 0, ANCHO, ALTO);
  const px = datos.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = (Math.random() - 0.5) * 16 + (((i / 4) % ANCHO) % 3 === 0 ? 3 : 0);
    px[i] += r;
    px[i + 1] += r;
    px[i + 2] += r;
  }
  ctx.putImageData(datos, 0, 0);
  // Lomo: la bisagra de la tapa a la izquierda.
  const lomo = ctx.createLinearGradient(0, 0, 60, 0);
  lomo.addColorStop(0, 'rgba(0,0,0,.35)');
  lomo.addColorStop(0.1, 'rgba(255,255,255,.14)');
  lomo.addColorStop(0.25, 'rgba(0,0,0,.12)');
  lomo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lomo;
  ctx.fillRect(0, 0, 60, ALTO);

  ctx.fillStyle = e.tinta;
  ctx.strokeStyle = e.tinta;
  ctx.textAlign = 'center';
  const centro = ANCHO / 2 + 10;
  const ancho = ANCHO - 120;
  const autorMay = autor.toUpperCase();

  if (estilo % ESTILOS_TELA.length === 0) {
    // Marco doble dorado, título en mayúsculas.
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 3;
    ctx.strokeRect(46, 36, ANCHO - 82, ALTO - 72);
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 2;
    ctx.strokeRect(58, 48, ANCHO - 106, ALTO - 96);
    ctx.globalAlpha = 1;
    ctx.font = '600 44px Fraunces, Georgia, serif';
    const r = partirEnRenglones(ctx, titulo.toUpperCase(), ancho);
    const y0 = ALTO / 2 - ((r.length - 1) * 50) / 2 - 20;
    r.forEach((t, i) => ctx.fillText(t, centro, y0 + i * 50));
    ctx.font = '600 17px "DM Sans", sans-serif';
    ctx.globalAlpha = 0.9;
    espaciado(ctx, autorMay, centro, y0 + r.length * 50 + 60, 4);
  } else if (estilo % ESTILOS_TELA.length === 1) {
    // Aro punteado con la inicial, título en cursiva.
    ctx.setLineDash([5, 7]);
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centro, ALTO * 0.36, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.font = 'italic 400 64px Fraunces, Georgia, serif';
    ctx.fillText((titulo.trim()[0] ?? '·').toUpperCase(), centro, ALTO * 0.36 + 22);
    ctx.font = 'italic 400 40px Fraunces, Georgia, serif';
    const r = partirEnRenglones(ctx, titulo, ancho);
    r.forEach((t, i) => ctx.fillText(t, centro, ALTO * 0.6 + i * 46));
    ctx.font = '600 15px "DM Sans", sans-serif';
    ctx.globalAlpha = 0.85;
    espaciado(ctx, autorMay, centro, ALTO * 0.6 + r.length * 46 + 34, 4);
  } else {
    // Línea roja y título abajo a la izquierda.
    const izq = 80;
    ctx.textAlign = 'left';
    ctx.fillStyle = e.fondo === '#1E1C1A' ? '#B23A2E' : e.tinta;
    ctx.fillRect(izq, 60, 5, 150);
    ctx.fillStyle = e.tinta;
    ctx.font = 'italic 400 48px Fraunces, Georgia, serif';
    const r = partirEnRenglones(ctx, titulo, ANCHO - izq - 50);
    const yFin = ALTO - 110;
    r.forEach((t, i) => ctx.fillText(t, izq, yFin - (r.length - 1 - i) * 52));
    ctx.font = '600 15px "DM Sans", sans-serif';
    ctx.globalAlpha = 0.8;
    espaciadoIzq(ctx, autorMay, izq, yFin + 46, 3.5);
  }
  return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('portada'))), 'image/jpeg', 0.88));
}

function espaciado(ctx: CanvasRenderingContext2D, texto: string, centro: number, y: number, espacio: number) {
  const anchos = [...texto].map((ch) => ctx.measureText(ch).width);
  const total = anchos.reduce((a, b) => a + b, 0) + espacio * Math.max(0, anchos.length - 1);
  espaciadoIzq(ctx, texto, centro - total / 2, y, espacio);
}

function espaciadoIzq(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, espacio: number) {
  const alineado = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of texto) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + espacio;
  }
  ctx.textAlign = alineado;
}
