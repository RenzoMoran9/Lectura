// Reparte los toques de la pantalla del lector:
//  - un dedo: pasa la hoja; con una herramienta, marca;
//  - con zoom (o de lado, con la hoja más alta que la pantalla): arriba y abajo mueve la página;
//    a los lados, pasa la hoja si ya se ve el borde del texto (si no, primero lo muestra);
//  - dos dedos: pellizco para acercar o alejar (y mover a la vez);
//  - doble toque: ajusta el texto al ancho de la pantalla, o vuelve al tamaño normal;
//  - dedo quieto medio segundo: pone el marcador en esa línea (o lo quita);
//  - rueda: con Ctrl acerca hacia el cursor; sin Ctrl y con zoom, desplaza.
// Las coordenadas son px CSS dentro del lector.

import type { Sentido } from './geometria';
import { acercarEn, type Zoom } from './zoom';

export interface Delegado {
  bajar: (x: number, y: number, id: number) => void;
  mover: (x: number, y: number, id: number) => void;
  subir: (x: number, y: number, id: number) => void;
  cancelar: () => void;
}

export interface OpcionesGestos {
  zoom: () => Zoom;
  ponerZoom: (z: Zoom, animar?: boolean) => void;
  herramienta: () => boolean;
  /** ¿Se puede mover la vista? (con zoom, o con la hoja más alta que la pantalla). */
  desplazable: () => boolean;
  /** Con la vista movible: ¿ya se ve el borde del texto hacia ese lado, para pasar la hoja? */
  puedePasar: (sentido: Sentido) => boolean;
  pasar: Delegado;
  marcar: Delegado;
  tocar: (x: number, y: number) => void;
  dobleToque: (x: number, y: number) => void;
  /** Terminó un pellizco (o Ctrl + rueda): se decide si queda con zoom o vuelve a lo normal. */
  finPellizco: () => void;
  /** La vista quedó quieta: momento de dibujar el detalle nítido. */
  finZoom: () => void;
  /** El dedo tocó la pantalla: se detiene cualquier movimiento que viniera de antes. */
  alTocar?: () => void;
  /** El dedo se quedó quieto medio segundo (en modo lectura): poner o quitar el marcador. */
  mantener?: (x: number, y: number) => void;
}

type Modo = 'nada' | 'decidir' | 'pasar' | 'marcar' | 'mover' | 'pellizco' | 'esperar' | 'mantenido';

const TOQUE_MOV = 9;
const DECIDIR = 10;
const TOQUE_MS = 350;
const DOBLE_MS = 300;
const MANTENER_MS = 500;

export class Gestos {
  private punteros = new Map<number, { x: number; y: number }>();
  private modo: Modo = 'nada';
  private pellizco: { d0: number; m0: { x: number; y: number }; z0: Zoom } | null = null;
  private toque: { x: number; y: number; t: number; movido: boolean } | null = null;
  private ultimoToque: { x: number; y: number; t: number } | null = null;
  private pendiente = 0;
  private ruedaQuieta = 0;
  /** Al mover hacia arriba o abajo, la página no se corre de lado. */
  private soloVertical = false;
  private velocidad = { x: 0, y: 0, t: 0 };
  private inercia = 0;
  private mantenido = 0;

  constructor(private o: OpcionesGestos) {}

  bajar(x: number, y: number, id: number) {
    this.pararInercia();
    this.o.alTocar?.();
    this.punteros.set(id, { x, y });
    if (this.punteros.size === 2) return this.empezarPellizco();
    if (this.punteros.size > 2 || this.modo === 'esperar') return;
    this.toque = { x, y, t: performance.now(), movido: false };
    if (this.o.herramienta()) {
      this.modo = 'marcar';
      this.o.marcar.bajar(x, y, id);
    } else if (this.o.desplazable()) {
      this.modo = 'decidir';
    } else {
      this.modo = 'pasar';
      this.o.pasar.bajar(x, y, id);
    }
    if (this.modo !== 'marcar' && this.o.mantener) {
      clearTimeout(this.mantenido);
      this.mantenido = window.setTimeout(() => this.alMantener(x, y), MANTENER_MS);
    }
  }

  /** Medio segundo con el dedo quieto: lo que empezaba a hacer se deshace y se pone el marcador. */
  private alMantener(x: number, y: number) {
    const t = this.toque;
    if (!t || t.movido || this.punteros.size !== 1 || (this.modo !== 'pasar' && this.modo !== 'decidir')) return;
    if (this.modo === 'pasar') this.o.pasar.cancelar();
    this.modo = 'mantenido';
    this.toque = null;
    this.o.mantener?.(x, y);
  }

  mover(x: number, y: number, id: number) {
    const antes = this.punteros.get(id);
    if (!antes) return;
    this.punteros.set(id, { x, y });
    if (this.toque && Math.hypot(x - this.toque.x, y - this.toque.y) > TOQUE_MOV) {
      this.toque.movido = true;
      clearTimeout(this.mantenido);
    }
    switch (this.modo) {
      case 'decidir':
        return this.decidir(x, y, id);
      case 'pellizco':
        return this.seguirPellizco();
      case 'mover':
        return this.desplazar(x - antes.x, y - antes.y);
      case 'marcar':
        return this.o.marcar.mover(x, y, id);
      case 'pasar':
        return this.o.pasar.mover(x, y, id);
    }
  }

  /** Con la vista movible, el primer tramo del dedo dice qué quiere: mover la página o pasarla. */
  private decidir(x: number, y: number, id: number) {
    const t = this.toque;
    if (!t) return;
    const dx = x - t.x;
    const dy = y - t.y;
    if (Math.hypot(dx, dy) < DECIDIR) return;
    const deLado = Math.abs(dx) > Math.abs(dy) * 1.2;
    if (deLado && this.o.puedePasar(dx < 0 ? 'adelante' : 'atras')) {
      this.modo = 'pasar';
      this.o.pasar.bajar(t.x, t.y, id);
      this.o.pasar.mover(x, y, id);
      return;
    }
    this.modo = 'mover';
    this.soloVertical = !deLado;
    this.velocidad = { x: 0, y: 0, t: performance.now() };
    this.desplazar(dx, dy);
  }

  private desplazar(dx: number, dy: number) {
    if (this.soloVertical) dx = 0;
    const z = this.o.zoom();
    this.o.ponerZoom({ z: z.z, x: z.x + dx, y: z.y + dy });
    const ahora = performance.now();
    const dt = Math.max(1, ahora - this.velocidad.t);
    const k = Math.min(1, dt / 40);
    this.velocidad = { x: this.velocidad.x * (1 - k) + (dx / dt) * k, y: this.velocidad.y * (1 - k) + (dy / dt) * k, t: ahora };
  }

  subir(x: number, y: number, id: number) {
    if (!this.punteros.has(id)) return;
    this.punteros.delete(id);
    clearTimeout(this.mantenido);
    const modo = this.modo;
    if (modo === 'mantenido') {
      this.modo = 'nada';
      return;
    }
    if (modo === 'pellizco' || modo === 'esperar') {
      this.modo = this.punteros.size ? 'esperar' : 'nada';
      if (!this.punteros.size) this.terminarPellizco();
      return;
    }
    this.modo = 'nada';
    if (modo === 'marcar') return this.o.marcar.subir(x, y, id);
    if (modo === 'pasar') this.o.pasar.subir(x, y, id);
    if (modo === 'mover') {
      // Si el dedo se soltó en movimiento, la página sigue deslizándose y frena sola.
      if (performance.now() - this.velocidad.t < 80 && Math.hypot(this.velocidad.x, this.velocidad.y) > 0.25) this.deslizar();
      else this.o.finZoom();
    }
    const t = this.toque;
    this.toque = null;
    if (t && !t.movido && performance.now() - t.t < TOQUE_MS) this.registrarToque(x, y);
  }

  cancelar(id: number) {
    if (!this.punteros.has(id)) return;
    this.punteros.delete(id);
    clearTimeout(this.mantenido);
    if (this.modo === 'marcar') this.o.marcar.cancelar();
    if (this.modo === 'pasar') this.o.pasar.cancelar();
    if (!this.punteros.size) {
      if (this.modo === 'pellizco' || this.modo === 'esperar') this.terminarPellizco();
      else if (this.modo === 'mover') this.o.finZoom();
      this.modo = 'nada';
    }
    this.toque = null;
  }

  /** Rueda del mouse o gesto del trackpad. Devuelve true si la usó (para evitar el zoom del navegador). */
  rueda(e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean }, x: number, y: number): boolean {
    const escala = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const z = this.o.zoom();
    let pellizco = false;
    if (e.ctrlKey || e.metaKey) {
      const nuevo = z.z * Math.exp(-e.deltaY * escala * 0.0024);
      this.o.ponerZoom(acercarEn(z, nuevo, x, y));
      pellizco = true;
    } else if (this.o.desplazable()) {
      this.o.ponerZoom({ z: z.z, x: z.x - e.deltaX * escala, y: z.y - e.deltaY * escala });
    } else return false;
    clearTimeout(this.ruedaQuieta);
    this.ruedaQuieta = window.setTimeout(() => (pellizco ? this.terminarPellizco() : this.o.finZoom()), 180);
    return true;
  }

  private empezarPellizco() {
    clearTimeout(this.mantenido);
    // El segundo dedo manda: lo que hacía el primero se deshace.
    if (this.modo === 'pasar') this.o.pasar.cancelar();
    if (this.modo === 'marcar') this.o.marcar.cancelar();
    clearTimeout(this.pendiente);
    this.toque = null;
    const [a, b] = [...this.punteros.values()];
    this.modo = 'pellizco';
    this.pellizco = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, z0: this.o.zoom() };
  }

  private seguirPellizco() {
    const p = this.pellizco;
    if (!p || this.punteros.size < 2) return;
    const [a, b] = [...this.punteros.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const z = acercarEn(p.z0, p.z0.z * (d / p.d0), p.m0.x, p.m0.y);
    this.o.ponerZoom({ z: z.z, x: z.x + m.x - p.m0.x, y: z.y + m.y - p.m0.y });
  }

  private terminarPellizco() {
    this.pellizco = null;
    this.o.finPellizco();
    this.o.finZoom();
  }

  private deslizar() {
    let { x: vx, y: vy } = this.velocidad;
    let antes = performance.now();
    const paso = () => {
      const ahora = performance.now();
      const dt = Math.min(40, ahora - antes);
      antes = ahora;
      const z = this.o.zoom();
      this.o.ponerZoom({ z: z.z, x: z.x + vx * dt, y: z.y + vy * dt });
      const tras = this.o.zoom();
      // Contra el borde, se frena en ese eje.
      if (Math.abs(tras.x - z.x) < 0.01) vx = 0;
      if (Math.abs(tras.y - z.y) < 0.01) vy = 0;
      const freno = Math.exp(-dt / 330);
      vx *= freno;
      vy *= freno;
      if (Math.hypot(vx, vy) < 0.02) {
        this.inercia = 0;
        this.o.finZoom();
        return;
      }
      this.inercia = requestAnimationFrame(paso);
    };
    this.inercia = requestAnimationFrame(paso);
  }

  private pararInercia() {
    if (!this.inercia) return;
    cancelAnimationFrame(this.inercia);
    this.inercia = 0;
    this.o.finZoom();
  }

  private registrarToque(x: number, y: number) {
    const ahora = performance.now();
    const u = this.ultimoToque;
    if (u && ahora - u.t < DOBLE_MS && Math.hypot(x - u.x, y - u.y) < 40) {
      clearTimeout(this.pendiente);
      this.ultimoToque = null;
      this.o.dobleToque(x, y);
      return;
    }
    this.ultimoToque = { x, y, t: ahora };
    clearTimeout(this.pendiente);
    this.pendiente = window.setTimeout(() => this.o.tocar(x, y), DOBLE_MS - 20);
  }

  /** ¿Hay un gesto en curso? (para no mover la vista por debajo del dedo). */
  get ocupado() {
    return this.modo !== 'nada' || this.inercia !== 0;
  }

  destruir() {
    clearTimeout(this.mantenido);
    clearTimeout(this.pendiente);
    clearTimeout(this.ruedaQuieta);
    cancelAnimationFrame(this.inercia);
  }
}

