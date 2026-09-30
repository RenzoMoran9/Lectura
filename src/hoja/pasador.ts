// El gesto de pasar la hoja.
//  - Hacia adelante, el punto que tomaste de la hoja va pegado a tu dedo.
//  - Hacia atrás, la hoja anterior vuelve desde el lomo y su doblez sigue a tu dedo. En doble
//    página se toma la hoja izquierda y también va pegada al dedo.
//  - Al soltar: pasada la mitad, cae; antes de la mitad regresa, salvo que la hayas lanzado con un
//    gesto rápido hacia el otro lado (como quien pasa la hoja de un golpe). Un toque no la pasa.

import {
  avance,
  calcularDoblez,
  pasaLaHoja,
  posicionPasada,
  radioMaximo,
  restringir,
  type Doblez,
  type Sentido,
  type Vec,
} from './geometria';

export interface Pase {
  sentido: Sentido;
  doblez: Doblez | null;
  sombra: number;
}

export interface OpcionesPasador {
  tamano: () => { w: number; h: number };
  /** Doble página: la hoja derecha se toma a la derecha del lomo y la izquierda (x < 0) vuelve atrás. */
  doble?: () => boolean;
  puede: (s: Sentido) => boolean;
  alCambiar: (pase: Pase | null) => void;
  alTerminar: (s: Sentido, paso: boolean) => void;
  alTocar?: (x: number, y: number) => void;
  alEmpezar?: () => void;
  alMover?: (velocidad: number) => void;
  alAsentar?: (fuerza: number) => void;
}

type Fase = 'quieto' | 'esperando' | 'arrastrando' | 'ignorado' | 'animando';

const UMBRAL = 7; // px antes de decidir si el dedo quiere pasar la hoja
/** Un gesto rápido pasa la hoja aunque no llegue a la mitad: px/ms hacia el otro lado y recorrido mínimo. */
const LANZAR_VELOCIDAD = 0.45;
const LANZAR_RECORRIDO = 28;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Pasador {
  private fase: Fase = 'quieto';
  private puntero: number | null = null;
  private inicio = { x: 0, y: 0, t: 0 };
  private sentido: Sentido = 'adelante';
  private P: Vec = { x: 0, y: 0 };
  private F: Vec = { x: 0, y: 0 };
  private factorAtras = 2;
  private ultimo = { x: 0, y: 0, t: 0 };
  private velocidad = { x: 0, y: 0 };
  private animacion: { cuadro: number; terminar: () => void } | null = null;

  constructor(private o: OpcionesPasador) {}

  get ocupado() {
    return this.fase === 'arrastrando' || this.fase === 'animando';
  }

  bajar(x: number, y: number, id: number) {
    if (this.puntero !== null && this.fase !== 'animando') return; // un segundo dedo: se ignora
    if (this.animacion) this.animacion.terminar();
    this.puntero = id;
    this.fase = 'esperando';
    const t = performance.now();
    this.inicio = { x, y, t };
    this.ultimo = { x, y, t };
  }

  mover(x: number, y: number, id: number) {
    if (id !== this.puntero) return;
    if (this.fase === 'esperando') {
      const dx = x - this.inicio.x;
      const dy = y - this.inicio.y;
      if (Math.hypot(dx, dy) < UMBRAL) return;
      if (Math.abs(dx) < Math.abs(dy) * 0.7) {
        this.fase = 'ignorado';
        return;
      }
      const sentido: Sentido = dx < 0 ? 'adelante' : 'atras';
      // En doble página cada hoja se toma de su lado del lomo.
      const lado = this.o.doble?.() ? (this.inicio.x < 0 ? 'atras' : 'adelante') : sentido;
      if (lado !== sentido || !this.o.puede(sentido)) {
        this.fase = 'ignorado';
        return;
      }
      this.empezar(sentido);
    }
    if (this.fase !== 'arrastrando') return;
    const { w } = this.o.tamano();
    const objetivo =
      this.sentido === 'adelante' || this.o.doble?.()
        ? { x, y }
        : { x: -w + this.factorAtras * (x - this.inicio.x), y: this.P.y + (y - this.inicio.y) };
    this.llevarA(objetivo);
  }

  subir(x: number, y: number, id: number) {
    if (id !== this.puntero) return;
    this.puntero = null;
    if (this.fase === 'esperando') {
      this.fase = 'quieto';
      const quieto = Math.hypot(x - this.inicio.x, y - this.inicio.y) < UMBRAL;
      if (quieto && performance.now() - this.inicio.t < 450) this.o.alTocar?.(x, y);
      return;
    }
    if (this.fase === 'ignorado') {
      this.fase = 'quieto';
      return;
    }
    if (this.fase !== 'arrastrando') return;
    const progreso = avance(this.sentido, this.P, this.F, this.o.doble?.());
    const pasa = pasaLaHoja(progreso) || this.lanzada(x);
    const pasada = posicionPasada(this.P);
    const destino = this.sentido === 'adelante' ? (pasa ? pasada : this.P) : pasa ? this.P : pasada;
    this.animar(destino, pasa);
  }

  /**
   * ¿Se soltó la hoja en pleno gesto rápido hacia el otro lado? (el dedo seguía moviéndose y ya
   * había recorrido un poco). Hacia adelante el dedo va a la izquierda; hacia atrás, a la derecha.
   */
  private lanzada(x: number) {
    const reciente = performance.now() - this.ultimo.t < 90;
    const vx = this.velocidad.x;
    const recorrido = Math.abs(x - this.inicio.x);
    if (!reciente || recorrido < LANZAR_RECORRIDO) return false;
    return this.sentido === 'adelante' ? vx < -LANZAR_VELOCIDAD : vx > LANZAR_VELOCIDAD;
  }

  /** Si el sistema interrumpe el gesto (llamada, cambio de app…), la hoja vuelve a su sitio. */
  cancelar() {
    if (this.fase === 'arrastrando') {
      this.puntero = null;
      const destino = this.sentido === 'adelante' ? this.P : posicionPasada(this.P);
      this.animar(destino, false);
      return;
    }
    if (this.fase !== 'animando') {
      this.fase = 'quieto';
      this.puntero = null;
    }
  }

  /** Pasar la hoja con el teclado o un botón: la esquina de abajo hace el mismo recorrido. */
  pasarSola(sentido: Sentido) {
    if (this.fase === 'arrastrando' || this.fase === 'esperando') return;
    if (this.animacion) this.animacion.terminar();
    if (!this.o.puede(sentido)) return;
    const { w, h } = this.o.tamano();
    const doble = this.o.doble?.();
    this.inicio = { x: sentido === 'adelante' ? w * 0.97 : doble ? -w * 0.97 : 0, y: h * 0.1, t: performance.now() };
    this.empezar(sentido);
    const pasada = posicionPasada(this.P);
    const desde = sentido === 'adelante' ? this.P : pasada;
    const hasta = sentido === 'adelante' ? pasada : this.P;
    this.F = desde;
    this.animar(hasta, true, { desde, duracion: 640, arco: h * 0.09 });
  }

  private empezar(sentido: Sentido) {
    const { w } = this.o.tamano();
    this.sentido = sentido;
    this.fase = 'arrastrando';
    if (sentido === 'adelante') {
      this.P = { x: Math.max(8, Math.min(w - 1, this.inicio.x)), y: this.inicio.y };
      this.F = { ...this.P };
    } else if (this.o.doble?.()) {
      // La hoja izquierda está dada vuelta: el punto que tocaste es su reflejo sobre el lomo.
      this.P = { x: Math.max(8, Math.min(w - 1, -this.inicio.x)), y: this.inicio.y };
      this.F = posicionPasada(this.P);
    } else {
      this.P = { x: w, y: this.inicio.y };
      this.F = posicionPasada(this.P);
      this.factorAtras = (2 * w) / Math.max(w - this.inicio.x, w * 0.2);
    }
    this.velocidad = { x: 0, y: 0 };
    this.o.alEmpezar?.();
  }

  private llevarA(objetivo: Vec) {
    const { h } = this.o.tamano();
    const antes = this.F;
    this.F = restringir(this.P, objetivo, h);
    const t = performance.now();
    const dt = Math.max(1, t - this.ultimo.t);
    const vx = (this.F.x - antes.x) / dt;
    const vy = (this.F.y - antes.y) / dt;
    this.velocidad = { x: this.velocidad.x * 0.4 + vx * 0.6, y: this.velocidad.y * 0.4 + vy * 0.6 };
    this.ultimo = { x: this.F.x, y: this.F.y, t };
    this.o.alMover?.(Math.hypot(vx, vy));
    this.avisar();
  }

  private avisar() {
    const { w, h } = this.o.tamano();
    const doblez = calcularDoblez(this.P, this.F, h, radioMaximo(w, h));
    // Fracción de la vuelta completa: las sombras aparecen y se van con suavidad.
    const f = Math.max(0, Math.min(1, (this.P.x - this.F.x) / Math.max(2 * this.P.x, 1)));
    const sombra = smooth(0, 0.06, f) * (1 - smooth(0.86, 1, f));
    this.o.alCambiar({ sentido: this.sentido, doblez, sombra });
  }

  private animar(destino: Vec, paso: boolean, extra?: { desde: Vec; duracion: number; arco: number }) {
    const { w, h } = this.o.tamano();
    const desde = extra?.desde ?? { ...this.F };
    const dx = destino.x - desde.x;
    const dy = destino.y - desde.y;
    const largo = Math.hypot(dx, dy);
    const sentido = this.sentido;
    const cerrar = (fuerzaGolpe: number) => {
      if (this.animacion) cancelAnimationFrame(this.animacion.cuadro);
      this.animacion = null;
      this.fase = 'quieto';
      this.o.alCambiar(null);
      if (fuerzaGolpe > 0) this.o.alAsentar?.(fuerzaGolpe);
      this.o.alTerminar(sentido, paso && this.cambiaPagina(sentido, destino));
    };
    if (largo < 1) {
      cerrar(0);
      return;
    }
    this.fase = 'animando';
    // La hoja sigue con el impulso que traía el dedo y se posa suave (curva de Hermite).
    const duracion = extra?.duracion ?? Math.max(170, Math.min(520, 170 + 380 * (largo / (2 * w))));
    const vProy = (this.velocidad.x * dx + this.velocidad.y * dy) / largo; // px/ms hacia el destino
    const m0 = extra ? 0 : Math.max(0, Math.min(2.6, (vProy * duracion) / largo));
    const t0 = performance.now();
    const fuerza = paso && this.cambiaPagina(sentido, destino) ? 1 : 0.45;
    const paso1 = () => {
      const t = Math.min(1, (performance.now() - t0) / duracion);
      const e = extra
        ? 0.5 - 0.5 * Math.cos(Math.PI * t)
        : (t * t * t - 2 * t * t + t) * m0 + (-2 * t * t * t + 3 * t * t);
      const arco = extra ? extra.arco * Math.sin(Math.PI * e) : 0;
      const antes = this.F;
      this.F = restringir(this.P, { x: desde.x + dx * e, y: desde.y + dy * e + arco }, h);
      const v = Math.hypot(this.F.x - antes.x, this.F.y - antes.y) / 16.7;
      this.o.alMover?.(v);
      this.avisar();
      if (t >= 1) {
        cerrar(fuerza);
        return;
      }
      if (this.animacion) this.animacion.cuadro = requestAnimationFrame(paso1);
    };
    this.animacion = {
      cuadro: requestAnimationFrame(paso1),
      terminar: () => {
        this.F = restringir(this.P, destino, h);
        cerrar(0);
      },
    };
  }

  /** ¿El destino deja la página cambiada? (adelante: la hoja cayó al otro lado; atrás: volvió a cubrir). */
  private cambiaPagina(sentido: Sentido, destino: Vec) {
    return sentido === 'adelante' ? destino.x < 0 : destino.x > 0;
  }

  destruir() {
    if (this.animacion) cancelAnimationFrame(this.animacion.cuadro);
    this.animacion = null;
  }
}
