// Reparte los toques de la pantalla del lector:
//  - un dedo: pasa la hoja; con una herramienta, marca; con zoom, mueve la página;
//  - dos dedos: pellizco para acercar o alejar (y mover a la vez);
//  - doble toque: acerca donde tocaste, o vuelve al tamaño normal;
//  - rueda: con Ctrl acerca hacia el cursor; sin Ctrl y con zoom, desplaza.
// Las coordenadas son px CSS dentro del lector.

import { acercarEn, conZoom, SIN_ZOOM, type Zoom } from './zoom';

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
  pasar: Delegado;
  marcar: Delegado;
  tocar: (x: number, y: number) => void;
  dobleToque: (x: number, y: number) => void;
  /** El zoom quedó quieto: momento de dibujar el detalle nítido. */
  finZoom: () => void;
}

type Modo = 'nada' | 'pasar' | 'marcar' | 'mover' | 'pellizco' | 'esperar';

const TOQUE_MOV = 9;
const TOQUE_MS = 350;
const DOBLE_MS = 300;

export class Gestos {
  private punteros = new Map<number, { x: number; y: number }>();
  private modo: Modo = 'nada';
  private pellizco: { d0: number; m0: { x: number; y: number }; z0: Zoom } | null = null;
  private toque: { x: number; y: number; t: number; movido: boolean } | null = null;
  private ultimoToque: { x: number; y: number; t: number } | null = null;
  private pendiente = 0;
  private ruedaQuieta = 0;

  constructor(private o: OpcionesGestos) {}

  bajar(x: number, y: number, id: number) {
    this.punteros.set(id, { x, y });
    if (this.punteros.size === 2) return this.empezarPellizco();
    if (this.punteros.size > 2 || this.modo === 'esperar') return;
    this.toque = { x, y, t: performance.now(), movido: false };
    if (this.o.herramienta()) {
      this.modo = 'marcar';
      this.o.marcar.bajar(x, y, id);
    } else if (conZoom(this.o.zoom())) {
      this.modo = 'mover';
    } else {
      this.modo = 'pasar';
      this.o.pasar.bajar(x, y, id);
    }
  }

  mover(x: number, y: number, id: number) {
    const antes = this.punteros.get(id);
    if (!antes) return;
    this.punteros.set(id, { x, y });
    if (this.toque && Math.hypot(x - this.toque.x, y - this.toque.y) > TOQUE_MOV) this.toque.movido = true;
    switch (this.modo) {
      case 'pellizco':
        return this.seguirPellizco();
      case 'mover': {
        const z = this.o.zoom();
        this.o.ponerZoom({ z: z.z, x: z.x + x - antes.x, y: z.y + y - antes.y });
        return;
      }
      case 'marcar':
        return this.o.marcar.mover(x, y, id);
      case 'pasar':
        return this.o.pasar.mover(x, y, id);
    }
  }

  subir(x: number, y: number, id: number) {
    if (!this.punteros.has(id)) return;
    this.punteros.delete(id);
    const modo = this.modo;
    if (modo === 'pellizco' || modo === 'esperar') {
      this.modo = this.punteros.size ? 'esperar' : 'nada';
      if (!this.punteros.size) this.terminarZoom();
      return;
    }
    this.modo = 'nada';
    if (modo === 'marcar') return this.o.marcar.subir(x, y, id);
    if (modo === 'pasar') this.o.pasar.subir(x, y, id);
    if (modo === 'mover') this.o.finZoom();
    const t = this.toque;
    this.toque = null;
    if (t && !t.movido && performance.now() - t.t < TOQUE_MS) this.registrarToque(x, y);
  }

  cancelar(id: number) {
    if (!this.punteros.has(id)) return;
    this.punteros.delete(id);
    if (this.modo === 'marcar') this.o.marcar.cancelar();
    if (this.modo === 'pasar') this.o.pasar.cancelar();
    if (!this.punteros.size) {
      if (this.modo === 'pellizco' || this.modo === 'esperar' || this.modo === 'mover') this.terminarZoom();
      this.modo = 'nada';
    }
    this.toque = null;
  }

  /** Rueda del mouse o gesto del trackpad. Devuelve true si la usó (para evitar el zoom del navegador). */
  rueda(e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean }, x: number, y: number): boolean {
    const escala = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const z = this.o.zoom();
    if (e.ctrlKey || e.metaKey) {
      const nuevo = z.z * Math.exp(-e.deltaY * escala * 0.0024);
      this.o.ponerZoom(acercarEn(z, nuevo, x, y));
    } else if (conZoom(z)) {
      this.o.ponerZoom({ z: z.z, x: z.x - e.deltaX * escala, y: z.y - e.deltaY * escala });
    } else return false;
    clearTimeout(this.ruedaQuieta);
    this.ruedaQuieta = window.setTimeout(() => this.terminarZoom(), 180);
    return true;
  }

  private empezarPellizco() {
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

  private terminarZoom() {
    this.pellizco = null;
    if (this.o.zoom().z < 1.08) this.o.ponerZoom(SIN_ZOOM, true);
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

  destruir() {
    clearTimeout(this.pendiente);
    clearTimeout(this.ruedaQuieta);
  }
}
