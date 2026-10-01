// El dedo en modo resaltar, encerrar o borrar (la hoja no se pasa).
//  - Resaltador: arrastras sobre el texto y se marca por palabras, aunque ocupe varios renglones.
//    En páginas escaneadas (o fuera del texto) queda una banda a mano y se guarda un recorte.
//  - Lápiz: dibujas un círculo a mano alrededor de la frase; se guardan las palabras que quedan dentro.
//  - Recuadro: arrastras de una esquina a la otra, como una captura. Al soltar, el cuadro se queda
//    para ajustarlo (las esquinas se mueven y, tocando dentro, se mueve entero) hasta «Guardar» o
//    «Compartir». Se guarda lo que queda dentro (en páginas escaneadas, el recorte) y en la página
//    queda el cuadro a lápiz.
//  - Borrador: tocas una marca y se quita.

import { cajaDe, dibujarFrase, tocaMarca, type Ubicacion } from './dibujo';
import { nuevoId, type ColorMarca, type Frase, type Herramienta, type Punto, type Rect } from './modelo';
import { encerradas, enRecuadro, letraEn, seleccionar, type Seleccion, type TextoPagina } from './texto';

export type Previa = (Pick<Frase, 'tipo' | 'color' | 'rects' | 'trazo' | 'grosor' | 'caja'> & { renglones?: number }) | null;

export interface UbicacionPagina {
  x: number;
  y: number;
  escala: number;
}

export interface OpcionesMarcador {
  herramienta: () => Herramienta | null;
  color: () => ColorMarca;
  libroId: () => string;
  pagina: () => number;
  ubicacion: () => UbicacionPagina | undefined;
  /** Texto de la página actual (null mientras se lee o si no se pudo leer). */
  texto: () => TextoPagina | null;
  /** Lienzo de la página ya dibujada (para recortar en páginas escaneadas) y su densidad. */
  lienzoPagina: () => { lienzo: HTMLCanvasElement; dpr: number } | undefined;
  frasesPagina: () => Frase[];
  previa: (p: Previa) => void;
  guardar: (f: Frase, dondeCss: { x: number; y: number }, opciones?: { compartir?: boolean }) => void;
  /** El recuadro que espera «Guardar» o «Compartir» (null cuando ya no hay). Caja en px CSS de la hoja. */
  alPendiente?: (p: { caja: { x: number; y: number; w: number; h: number }; renglones?: number } | null) => void;
  borrar: (ids: string[]) => void;
}

const GROSOR_BANDA = 15; // px CSS del resaltado a mano
const RECUADRO_MIN = 18; // px CSS: un recuadro más chico no se guarda (fue un toque)

/** El rectángulo entre dos puntos, en cualquier dirección. */
export function rectEntre([ax, ay]: Punto, [bx, by]: Punto): Rect {
  return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
}

type Ajuste = { tipo: 'nuevo' } | { tipo: 'esquina'; fijo: Punto } | { tipo: 'mover'; desde: Punto; caja0: Rect };

export class Marcador {
  private puntero: number | null = null;
  /** Recuadro hecho que espera «Guardar» o «Compartir», con su página y su color. */
  private pendiente: { caja: Rect; pagina: number; color: ColorMarca } | null = null;
  private ajuste: Ajuste | null = null;
  private cajaEnCurso: Rect | null = null;
  private trazo: Punto[] = [];
  private largoCss = 0;
  private inicio = -1;
  private sel: Seleccion | null = null;
  private tocoTexto = false;
  private borradas = new Set<string>();

  constructor(private o: OpcionesMarcador) {}

  /** (x, y) en px CSS dentro de la hoja, desde arriba a la izquierda. */
  private aPagina(x: number, y: number): Punto | null {
    const u = this.o.ubicacion();
    return u ? [(x - u.x) / u.escala, (y - u.y) / u.escala] : null;
  }

  bajar(x: number, y: number, id: number) {
    if (this.puntero !== null) return;
    const p = this.aPagina(x, y);
    if (!p) return;
    this.puntero = id;
    this.trazo = [p];
    this.largoCss = 0;
    this.sel = null;
    this.tocoTexto = false;
    this.borradas.clear();
    const h = this.o.herramienta();
    if (h === 'resaltador') {
      const t = this.o.texto();
      const esc = this.o.ubicacion()!.escala;
      this.inicio = t?.tieneTexto ? letraEn(t, p[0], p[1], 22 / esc) : -1;
      this.tocoTexto = this.inicio >= 0;
    } else if (h === 'borrador') this.borrarEn(p);
    else if (h === 'recuadro') this.ajuste = this.queAjustar(p);
  }

  /** Con un recuadro esperando: ¿el dedo toma una esquina, lo toma entero o empieza otro? */
  private queAjustar(p: Punto): Ajuste {
    const pend = this.pendiente;
    const u = this.o.ubicacion();
    this.cajaEnCurso = null;
    if (!pend || !u || pend.pagina !== this.o.pagina()) return { tipo: 'nuevo' };
    const [x, y, w, h] = pend.caja;
    const esquinas: Punto[] = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    let k = -1;
    let dMin = 30 / u.escala;
    esquinas.forEach((e, i) => {
      const d = Math.hypot(e[0] - p[0], e[1] - p[1]);
      if (d < dMin) {
        dMin = d;
        k = i;
      }
    });
    if (k >= 0) return { tipo: 'esquina', fijo: esquinas[(k + 2) % 4] };
    if (p[0] >= x && p[0] <= x + w && p[1] >= y && p[1] <= y + h) return { tipo: 'mover', desde: p, caja0: pend.caja };
    return { tipo: 'nuevo' };
  }

  mover(x: number, y: number, id: number) {
    if (id !== this.puntero) return;
    const p = this.aPagina(x, y);
    const u = this.o.ubicacion();
    if (!p || !u) return;
    const ultimo = this.trazo[this.trazo.length - 1];
    const d = Math.hypot(p[0] - ultimo[0], p[1] - ultimo[1]) * u.escala;
    if (d < 1.5) return;
    this.trazo.push(p);
    this.largoCss += d;
    const h = this.o.herramienta();
    if (h === 'borrador') return this.borrarEn(p);
    if (h === 'lapiz') return this.o.previa({ tipo: 'encerrado', color: this.o.color(), trazo: this.trazo });
    if (h === 'recuadro') {
      const a = this.ajuste ?? { tipo: 'nuevo' };
      const caja: Rect =
        a.tipo === 'esquina'
          ? rectEntre(a.fijo, p)
          : a.tipo === 'mover'
            ? [a.caja0[0] + p[0] - a.desde[0], a.caja0[1] + p[1] - a.desde[1], a.caja0[2], a.caja0[3]]
            : rectEntre(this.trazo[0], p);
      this.cajaEnCurso = caja;
      return this.mostrarRecuadro(caja, this.o.color());
    }
    if (h === 'resaltador') {
      const t = this.o.texto();
      if (t?.tieneTexto) {
        const j = letraEn(t, p[0], p[1], 34 / u.escala);
        if (j >= 0) {
          if (this.inicio < 0) this.inicio = j;
          this.tocoTexto = true;
          this.sel = seleccionar(t, this.inicio, j) ?? this.sel;
        }
      }
      if (this.tocoTexto) this.o.previa(this.sel ? { tipo: 'resaltado', color: this.o.color(), rects: this.sel.rects } : null);
      else this.o.previa({ tipo: 'resaltado', color: this.o.color(), trazo: this.trazo, grosor: GROSOR_BANDA / u.escala });
    }
  }

  subir(id: number) {
    if (id !== this.puntero) return;
    this.puntero = null;
    const h = this.o.herramienta();
    const u = this.o.ubicacion();
    if (!u || h === 'borrador' || !h) {
      this.o.previa(null);
      return;
    }
    const base = {
      id: nuevoId(),
      libroId: this.o.libroId(),
      pagina: this.o.pagina(),
      color: this.o.color(),
      creada: Date.now(),
    };
    let frase: Frase | null = null;
    if (h === 'resaltador') {
      if (this.tocoTexto && this.sel) frase = { ...base, tipo: 'resaltado', texto: this.sel.texto, rects: this.sel.rects };
      else if (!this.tocoTexto && this.largoCss > 24)
        frase = { ...base, tipo: 'resaltado', texto: '', trazo: simplificar(this.trazo, 1 / u.escala), grosor: GROSOR_BANDA / u.escala };
    } else if (h === 'recuadro') {
      // No se guarda todavía: el cuadro se queda para ajustarlo.
      const caja = this.cajaEnCurso;
      this.ajuste = null;
      this.cajaEnCurso = null;
      if (caja && caja[2] * u.escala >= RECUADRO_MIN && caja[3] * u.escala >= RECUADRO_MIN)
        this.pendiente = { caja, pagina: this.o.pagina(), color: this.pendiente?.color ?? this.o.color() };
      // Un toque en otra página (doble página) deja el recuadro de la otra: se descarta.
      else if (this.pendiente && this.pendiente.pagina !== this.o.pagina()) this.pendiente = null;
      if (this.pendiente) this.mostrarRecuadro(this.pendiente.caja, this.pendiente.color, true);
      else this.descartar();
      return;
    } else if (h === 'lapiz' && this.largoCss > 30) {
      const t = this.o.texto();
      const sel = t?.tieneTexto ? encerradas(t, this.trazo) : null;
      frase = { ...base, tipo: 'encerrado', texto: sel?.texto ?? '', trazo: simplificar(this.trazo, 0.6 / u.escala) };
    }
    if (!frase) {
      this.o.previa(null);
      return;
    }
    const caja = cajaDe(frase)!;
    const donde = { x: u.x + (caja[0] + caja[2]) * u.escala, y: u.y + caja[1] * u.escala };
    if (!frase.texto) {
      // Sin texto (escaneado o fuera del texto): se guarda el recorte de la página con su marca.
      void recortar(frase, u, this.o.lienzoPagina()).then((imagen) => this.o.guardar({ ...frase!, imagen }, donde));
    } else this.o.guardar(frase, donde);
  }

  /** El recuadro (en curso o esperando) con lo de afuera oscuro y cuántos renglones van dentro. */
  private mostrarRecuadro(caja: Rect, color: ColorMarca, avisar = false) {
    const t = this.o.texto();
    const sel = t?.tieneTexto ? enRecuadro(t, caja) : null;
    const renglones = sel ? new Set(sel.rects.map((r) => Math.round(r[1]))).size : undefined;
    this.o.previa({ tipo: 'recuadro', color, caja, renglones });
    const u = this.o.ubicacion();
    if (avisar && u)
      this.o.alPendiente?.({
        caja: { x: u.x + caja[0] * u.escala, y: u.y + caja[1] * u.escala, w: caja[2] * u.escala, h: caja[3] * u.escala },
        renglones,
      });
  }

  /** ¿Hay un recuadro esperando «Guardar» o «Compartir»? */
  get hayPendiente() {
    return !!this.pendiente;
  }

  /** Guarda el recuadro que esperaba (y, si se pide, lo abre para compartir). */
  confirmar(compartir = false) {
    const pend = this.pendiente;
    const u = this.o.ubicacion();
    this.pendiente = null;
    this.ajuste = null;
    this.o.alPendiente?.(null);
    if (!pend || !u) {
      this.o.previa(null);
      return;
    }
    const t = this.o.texto();
    const sel = t?.tieneTexto ? enRecuadro(t, pend.caja) : null;
    const frase: Frase = {
      id: nuevoId(),
      libroId: this.o.libroId(),
      pagina: pend.pagina,
      color: pend.color,
      creada: Date.now(),
      tipo: 'recuadro',
      texto: sel?.texto ?? '',
      caja: pend.caja.map(redondear) as Rect,
    };
    const [x, y, w] = pend.caja;
    const donde = { x: u.x + (x + w) * u.escala, y: u.y + y * u.escala };
    if (!frase.texto) void recortar(frase, u, this.o.lienzoPagina()).then((imagen) => this.o.guardar({ ...frase, imagen }, donde, { compartir }));
    else this.o.guardar(frase, donde, { compartir });
  }

  /** Quita el recuadro que esperaba, sin guardarlo. */
  descartar() {
    this.pendiente = null;
    this.ajuste = null;
    this.cajaEnCurso = null;
    this.o.previa(null);
    this.o.alPendiente?.(null);
  }

  /** Vuelve a dibujar el recuadro que espera (después de acomodar la pantalla). */
  redibujar() {
    if (this.pendiente && this.puntero === null) this.mostrarRecuadro(this.pendiente.caja, this.pendiente.color, true);
  }

  /** Al salir de la herramienta: el recuadro que esperaba se guarda. */
  terminar() {
    this.cancelar();
    if (this.pendiente) this.confirmar(false);
  }

  /** Solo si hay un trazo a medias (al soltar, la vista previa se queda hasta que la marca se dibuja). */
  cancelar() {
    if (this.puntero === null) return;
    this.puntero = null;
    this.ajuste = null;
    this.cajaEnCurso = null;
    if (this.pendiente) this.mostrarRecuadro(this.pendiente.caja, this.pendiente.color);
    else this.o.previa(null);
  }

  private borrarEn(p: Punto) {
    const u = this.o.ubicacion();
    if (!u) return;
    const tocadas = this.o.frasesPagina().filter((f) => !this.borradas.has(f.id) && tocaMarca(f, p[0], p[1], 12 / u.escala));
    // Un recuadro se borra tocando dentro; si ahí hay otra marca, primero se borra esa.
    const otras = tocadas.filter((f) => f.tipo !== 'recuadro');
    const ids = (otras.length ? otras : tocadas).map((f) => f.id);
    if (!ids.length) return;
    ids.forEach((i) => this.borradas.add(i));
    this.o.borrar(ids);
  }
}

/** Quita puntos casi alineados para que el trazo pese poco. */
export function simplificar(pts: Punto[], tolerancia: number): Punto[] {
  if (pts.length < 3) return pts.map(([a, b]) => [redondear(a), redondear(b)]);
  const fuera: Punto[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = fuera[fuera.length - 1];
    if (Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) >= tolerancia) fuera.push(pts[i]);
  }
  fuera.push(pts[pts.length - 1]);
  return fuera.map(([a, b]) => [redondear(a), redondear(b)]);
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Recorte de la página (con la marca encima) como JPEG, para frases de páginas escaneadas. */
async function recortar(
  f: Frase,
  u: UbicacionPagina,
  pagina: { lienzo: HTMLCanvasElement; dpr: number } | undefined,
): Promise<Blob | null> {
  const caja = cajaDe(f);
  if (!pagina || !caja) return null;
  const { lienzo, dpr } = pagina;
  // El recuadro se recorta justo por su borde y sin dibujarle las esquinas.
  const recuadro = f.tipo === 'recuadro';
  const pad = recuadro ? 0 : 12;
  const x0 = Math.max(0, Math.floor((u.x + caja[0] * u.escala - pad) * dpr));
  const y0 = Math.max(0, Math.floor((u.y + caja[1] * u.escala - pad) * dpr));
  const x1 = Math.min(lienzo.width, Math.ceil((u.x + (caja[0] + caja[2]) * u.escala + pad) * dpr));
  const y1 = Math.min(lienzo.height, Math.ceil((u.y + (caja[1] + caja[3]) * u.escala + pad) * dpr));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  const k = Math.min(1, 900 / (x1 - x0));
  const c = document.createElement('canvas');
  c.width = Math.round((x1 - x0) * k);
  c.height = Math.round((y1 - y0) * k);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(lienzo, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
  if (!recuadro) {
    ctx.globalCompositeOperation = 'multiply';
    const ub: Ubicacion = { x: u.x - x0 / dpr, y: u.y - y0 / dpr, escala: u.escala, dpr: dpr * k };
    dibujarFrase(ctx, f, ub);
  }
  return new Promise((ok) => c.toBlob((b) => ok(b), 'image/jpeg', 0.85));
}
