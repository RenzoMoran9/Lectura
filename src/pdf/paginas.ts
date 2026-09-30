// Dibuja las páginas del PDF en lienzos del tamaño de la hoja, listos para usarse como textura.
// Solo se dibujan la página visible y sus vecinas; las demás se sueltan para no gastar memoria.

import { medirContenido, type Contenido } from './contenido';
import type { DocumentoPdf } from './pdf';

export interface Maqueta {
  /** Tamaño de la hoja en px CSS. */
  ancho: number;
  alto: number;
  /** Densidad de píxeles con la que se dibuja. */
  dpr: number;
  /** Zona de la hoja (px CSS, desde arriba a la izquierda) donde cabe la página del PDF. */
  caja: { x: number; y: number; w: number; h: number };
  /** Título del libro para la cabecera tenue. */
  titulo: string;
}

const TINTA_TENUE = 'rgba(42, 37, 32, 0.46)';

export interface Ubicacion {
  /** Esquina de la página del PDF dentro de la hoja, en px CSS. */
  x: number;
  y: number;
  /** px CSS por unidad de la página (punto PDF). */
  escala: number;
  /** Tamaño de la página en unidades de la página. */
  ancho: number;
  alto: number;
}

export class Paginas {
  private listas = new Map<number, HTMLCanvasElement>();
  private deseadas: number[] = [];
  private enCurso: { indice: number; cancelar: () => void } | null = null;
  private maqueta: Maqueta | null = null;
  private version = 0;
  onLista?: (indice: number, lienzo: HTMLCanvasElement) => void;
  onSoltada?: (indice: number) => void;

  constructor(private doc: DocumentoPdf) {}


  get total() {
    return this.doc.numPages;
  }

  /** Sigue trabajando con otro documento abierto del mismo archivo (las páginas ya dibujadas se quedan). */
  cambiarDocumento(doc: DocumentoPdf) {
    this.enCurso?.cancelar();
    this.enCurso = null;
    this.doc = doc;
    this.siguiente();
  }

  configurar(m: Maqueta) {
    const antes = this.maqueta;
    this.maqueta = m;
    if (antes && JSON.stringify(antes) === JSON.stringify(m)) return;
    this.version++;
    this.enCurso?.cancelar();
    this.enCurso = null;
    // Las que ya había se quedan hasta que llegue su versión nueva: así no parpadea.
    this.siguiente();
  }

  obtener(indice: number) {
    return this.listas.get(indice);
  }

  /** Páginas que ya están dibujadas. */
  indices() {
    return [...this.listas.keys()];
  }

  /** Páginas que se quieren tener listas, en orden de prioridad. */
  pedir(indices: number[]) {
    this.deseadas = indices.filter((i) => i >= 0 && i < this.total);
    for (const i of [...this.listas.keys()]) {
      if (!this.deseadas.includes(i)) {
        this.listas.delete(i);
        this.onSoltada?.(i);
      }
    }
    if (this.enCurso && !this.deseadas.includes(this.enCurso.indice)) {
      this.enCurso.cancelar();
      this.enCurso = null;
    }
    this.siguiente();
  }

  private versionDe = new Map<number, number>();
  private ubicaciones = new Map<number, Ubicacion>();

  /** Dónde quedó la página del PDF dentro de la hoja (px CSS) y a qué escala. */
  ubicacion(indice: number): Ubicacion | undefined {
    return this.ubicaciones.get(indice);
  }

  // Tamaño de cada página (en puntos) y dónde está lo impreso: no dependen de la pantalla.
  private tamanos = new Map<number, { ancho: number; alto: number }>();
  private contenidos = new Map<number, Contenido | null>();

  /** Rectángulo de la página del PDF en la hoja (px CSS), con la disposición actual. */
  rectPagina(indice: number): { x: number; y: number; w: number; h: number } | null {
    const m = this.maqueta;
    const t = this.tamanos.get(indice);
    if (!m || !t) return null;
    const escala = Math.min(m.caja.w / t.ancho, m.caja.h / t.alto);
    const w = t.ancho * escala;
    const h = t.alto * escala;
    return { x: m.caja.x + (m.caja.w - w) / 2, y: m.caja.y + (m.caja.h - h) / 2, w, h };
  }

  /** Lo impreso de la página (fracciones de la página), si ya se midió. `null`: página en blanco. */
  contenido(indice: number): Contenido | null | undefined {
    return this.contenidos.get(indice);
  }

  /** Lo impreso de todas las páginas medidas hasta ahora. */
  contenidosMedidos(): Contenido[] {
    return [...this.contenidos.values()].filter((c): c is Contenido => !!c);
  }

  /** Tamaño del lienzo de cada página (px del dispositivo) y su densidad. */
  get lienzoTam() {
    const m = this.maqueta;
    return m ? { ancho: Math.round(m.ancho * m.dpr), alto: Math.round(m.alto * m.dpr), dpr: m.dpr } : null;
  }

  private siguiente() {
    if (this.enCurso || !this.maqueta) return;
    const falta = this.deseadas.find((i) => !this.listas.has(i) || this.versionDe.get(i) !== this.version);
    if (falta === undefined) return;
    void this.dibujar(falta);
  }

  private async dibujar(indice: number) {
    const m = this.maqueta!;
    const version = this.version;
    let cancelado = false;
    let tareaRender: { cancel: () => void } | null = null;
    this.enCurso = {
      indice,
      cancelar: () => {
        cancelado = true;
        tareaRender?.cancel();
      },
    };
    try {
      const pagina = await this.doc.getPage(indice + 1);
      if (cancelado) return;
      const base = pagina.getViewport({ scale: 1 });
      const escala = Math.min(m.caja.w / base.width, m.caja.h / base.height);
      const vista = pagina.getViewport({ scale: escala * m.dpr });
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(m.ancho * m.dpr);
      lienzo.height = Math.round(m.alto * m.dpr);
      const ctx = lienzo.getContext('2d', { alpha: false })!;
      const anchoPag = base.width * escala;
      const altoPag = base.height * escala;
      const x = m.caja.x + (m.caja.w - anchoPag) / 2;
      const y = m.caja.y + (m.caja.h - altoPag) / 2;
      const tarea = pagina.render({
        canvas: lienzo,
        viewport: vista,
        transform: [1, 0, 0, 1, Math.round(x * m.dpr), Math.round(y * m.dpr)],
      });
      tareaRender = tarea;
      await tarea.promise;
      if (cancelado) return;
      this.tamanos.set(indice, { ancho: base.width, alto: base.height });
      if (!this.contenidos.has(indice)) {
        this.contenidos.set(indice, medirContenido(lienzo, x * m.dpr, y * m.dpr, anchoPag * m.dpr, altoPag * m.dpr));
        // Solo se recuerdan unas cuantas (para el ancho típico del texto del libro).
        if (this.contenidos.size > 60) this.contenidos.delete(this.contenidos.keys().next().value!);
      }
      this.cabecera(ctx, m, indice, y, y + altoPag);
      pagina.cleanup();
      if (version !== this.version || !this.deseadas.includes(indice)) return;
      this.ubicaciones.set(indice, { x, y, escala, ancho: base.width, alto: base.height });
      this.listas.set(indice, lienzo);
      this.versionDe.set(indice, version);
      this.onLista?.(indice, lienzo);
    } catch (e) {
      if ((e as { name?: string })?.name !== 'RenderingCancelledException') console.error(`No se pudo dibujar la página ${indice + 1}`, e);
    } finally {
      if (this.enCurso?.indice === indice) this.enCurso = null;
      this.siguiente();
    }
  }

  /** Título del libro arriba y número de página abajo, tenues, en el margen que quede libre. */
  private cabecera(ctx: CanvasRenderingContext2D, m: Maqueta, indice: number, arriba: number, abajo: number) {
    ctx.save();
    ctx.scale(m.dpr, m.dpr);
    ctx.fillStyle = TINTA_TENUE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const centro = m.ancho / 2;
    if (arriba >= 22) {
      ctx.font = '600 9.5px Fraunces, Georgia, serif';
      const titulo = recortar(ctx, m.titulo.toUpperCase(), m.ancho * 0.7, 0.24);
      dibujarEspaciado(ctx, titulo, centro, arriba - 10, 9.5 * 0.24);
    }
    if (m.alto - abajo >= 22) {
      ctx.font = '400 12px Fraunces, Georgia, serif';
      ctx.fillText(String(indice + 1), centro, abajo + 17);
    }
    ctx.restore();
  }

  private detalleEnCurso: { cancel: () => void } | null = null;

  /**
   * Con zoom: dibuja solo el trozo visible de la página (`region`, px CSS de la hoja) con `k` píxeles
   * por px CSS, para que el texto se vea nítido. Devuelve el lienzo y dónde va (uv, y hacia arriba).
   */
  async dibujarDetalle(
    indice: number,
    region: { x: number; y: number; w: number; h: number },
    k: number,
  ): Promise<{ lienzo: HTMLCanvasElement; rect: [number, number, number, number] } | null> {
    this.detalleEnCurso?.cancel();
    this.detalleEnCurso = null;
    const m = this.maqueta;
    const ub = this.ubicaciones.get(indice);
    const baseLienzo = this.listas.get(indice);
    if (!m || !ub || !baseLienzo) return null;
    const ancho = Math.ceil(region.w * k);
    const alto = Math.ceil(region.h * k);
    if (ancho < 2 || alto < 2) return null;
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d', { alpha: false })!;
    // Primero la hoja ya dibujada (con su título y número), luego la página del PDF más nítida.
    ctx.drawImage(baseLienzo, region.x * m.dpr, region.y * m.dpr, region.w * m.dpr, region.h * m.dpr, 0, 0, ancho, alto);
    const px = (ub.x - region.x) * k;
    const py = (ub.y - region.y) * k;
    ctx.fillStyle = '#fff';
    ctx.fillRect(px, py, ub.ancho * ub.escala * k, ub.alto * ub.escala * k);
    let cancelado = false;
    try {
      const pagina = await this.doc.getPage(indice + 1);
      const vista = pagina.getViewport({ scale: ub.escala * k });
      const tarea = pagina.render({ canvas: lienzo, viewport: vista, transform: [1, 0, 0, 1, px, py], background: 'rgba(0,0,0,0)' });
      this.detalleEnCurso = {
        cancel: () => {
          cancelado = true;
          tarea.cancel();
        },
      };
      await tarea.promise;
    } catch {
      return null;
    }
    if (cancelado) return null;
    this.detalleEnCurso = null;
    const u0 = region.x / m.ancho;
    const u1 = (region.x + region.w) / m.ancho;
    const v0 = 1 - (region.y + region.h) / m.alto;
    const v1 = 1 - region.y / m.alto;
    return { lienzo, rect: [u0, v0, u1, v1] };
  }

  destruir() {
    this.enCurso?.cancelar();
    this.detalleEnCurso?.cancel();
    this.listas.clear();
  }
}

function dibujarEspaciado(ctx: CanvasRenderingContext2D, texto: string, centro: number, y: number, espacio: number) {
  const anchos = [...texto].map((c) => ctx.measureText(c).width);
  const total = anchos.reduce((a, b) => a + b, 0) + espacio * (anchos.length - 1);
  let x = centro - total / 2;
  ctx.textAlign = 'left';
  [...texto].forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += anchos[i] + espacio;
  });
  ctx.textAlign = 'center';
}

function recortar(ctx: CanvasRenderingContext2D, texto: string, max: number, espacioEm: number) {
  const mide = (t: string) => ctx.measureText(t).width * (1 + espacioEm * 0.9);
  if (mide(texto) <= max) return texto;
  let t = texto;
  while (t.length > 3 && mide(t + '…') > max) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** Portada: la primera página del PDF, pequeña, como imagen JPEG. */
export async function dibujarPortada(doc: DocumentoPdf, ancho = 240): Promise<Blob | null> {
  try {
    const pagina = await doc.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const vista = pagina.getViewport({ scale: ancho / base.width });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(vista.width);
    lienzo.height = Math.round(vista.height);
    await pagina.render({ canvas: lienzo, viewport: vista }).promise;
    pagina.cleanup();
    return await new Promise((ok) => lienzo.toBlob((b) => ok(b), 'image/jpeg', 0.82));
  } catch {
    return null;
  }
}
