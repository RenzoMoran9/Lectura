// Motor WebGL de la hoja: dibuja la página actual y, al pasarla, la hoja curvada con su reverso,
// su luz y su sombra sobre la página de abajo. Solo dibuja cuando algo cambia.

import type { Doblez } from './geometria';
import { PAPELES, texturaPapel, type TipoPapel } from './papel';
import { FRAGMENTOS, VERTICES } from './shaders';

export interface Rect {
  x: number; // izquierda, px CSS desde la izquierda del lienzo
  y: number; // arriba, px CSS desde arriba del lienzo
  w: number;
  h: number;
}

export interface Escena {
  hoja: number | null; // página que se ve encima (o que se está pasando); la derecha en doble página
  debajo: number | null; // página de abajo, mientras se pasa la hoja
  doblez: Doblez | null;
  sombra: number; // 0..1
  /** Doble página: la página de la izquierda (quieta) y la que va al dorso de la hoja que se pasa. */
  izquierda?: number | null;
  reverso?: number | null;
}

export interface OpcionesVista {
  /** Lo que pasa del lomo hacia la izquierda no se dibuja (una sola página sobre la mesa). */
  recortarLomo?: boolean;
  /** Libro abierto a doble página: la hoja es la página derecha; la izquierda va al otro lado del lomo. */
  doble?: boolean;
}

interface Detalle {
  tex: WebGLTexture;
  fuente: TexImageSource;
  rect: [number, number, number, number];
}

const TIPO_NUM: Record<TipoPapel, number> = { blanco: 0, crema: 1, antiguo: 2, noche: 3 };
const LUZ = (() => {
  const v = [-0.35, 0.3, 1];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export class MotorHoja {
  private gl!: WebGLRenderingContext;
  private prog!: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private nIndices = 0;
  private texPaginas = new Map<number, WebGLTexture>();
  private fuentes = new Map<number, TexImageSource>();
  /** Marcas (resaltador y lápiz) de cada página: se multiplican con ella en el shader. */
  private texMarcas = new Map<number, WebGLTexture>();
  private fuentesMarcas = new Map<number, TexImageSource>();
  private texPapel: WebGLTexture | null = null;
  private texBlanca: WebGLTexture | null = null;
  private papel: TipoPapel = 'crema';
  private vista = { w: 1, h: 1, dpr: 1 };
  /** Se baja sola si el celular no alcanza a dibujar a buen ritmo mientras pasa la hoja. */
  private calidad = 1;
  private intervalos: number[] = [];
  private ultimoCuadro = 0;
  private hojaRect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private recortarLomo = false;
  private doble = false;
  /** Acercamiento (px CSS de la pantalla, y hacia abajo): pantalla = (x, y) + zoom · lienzo. */
  private zoom = { z: 1, x: 0, y: 0 };
  private detalles = new Map<number, Detalle>();
  private escena: Escena = { hoja: null, debajo: null, doblez: null, sombra: 1 };
  private pedido = 0;
  private perdido = false;
  onPerdido?: () => void;

  constructor(private lienzo: HTMLCanvasElement) {
    lienzo.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.perdido = true;
    });
    lienzo.addEventListener('webglcontextrestored', () => {
      this.perdido = false;
      this.iniciar();
      void this.ponerPapel(this.papel);
      for (const [i, fuente] of this.fuentes) this.subirPagina(i, fuente);
      for (const [i, fuente] of this.fuentesMarcas) this.subirMarcas(i, fuente);
      for (const [i, d] of [...this.detalles]) this.ponerDetalle(i, d.fuente, d.rect);
      this.pedirDibujo();
    });
    this.iniciar();
  }

  private iniciar() {
    // Con pantallas densas el antialias no se nota y cuesta memoria.
    const densa = (window.devicePixelRatio || 1) >= 2;
    const opciones: WebGLContextAttributes = { alpha: true, antialias: !densa, premultipliedAlpha: true, depth: true };
    const gl = (this.lienzo.getContext('webgl2', opciones) || this.lienzo.getContext('webgl', opciones)) as WebGLRenderingContext | null;
    if (!gl) throw new Error('Este navegador no puede dibujar la hoja (falta WebGL).');
    this.gl = gl;
    this.texPaginas.clear();
    this.texMarcas.clear();
    this.detalles.clear();

    const compilar = (tipo: number, fuente: string) => {
      const s = gl.createShader(tipo)!;
      gl.shaderSource(s, fuente);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compilar(gl.VERTEX_SHADER, VERTICES));
    gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, FRAGMENTOS));
    gl.bindAttribLocation(prog, 0, 'aUv');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'programa');
    this.prog = prog;
    gl.useProgram(prog);
    for (const nombre of ['uTam', 'uOrigen', 'uVista', 'uN', 'uA', 'uR', 'uDoblar', 'uZ', 'uPagina', 'uPapel', 'uTipo',
      'uFondoNoche', 'uTintaNoche', 'uSombra', 'uDoblando', 'uLuz', 'uMarcas', 'uReverso', 'uMarcasReverso', 'uDetalle',
      'uDetalleRect', 'uConDetalle', 'uDobleCara', 'uIzquierda', 'uDesplaza', 'uZoom', 'uPan']) {
      this.u[nombre] = gl.getUniformLocation(prog, nombre);
    }
    gl.uniform1i(this.u.uPagina, 0);
    gl.uniform1i(this.u.uPapel, 1);
    gl.uniform1i(this.u.uMarcas, 2);
    gl.uniform1i(this.u.uReverso, 3);
    gl.uniform1i(this.u.uMarcasReverso, 4);
    gl.uniform1i(this.u.uDetalle, 5);
    gl.uniform3fv(this.u.uLuz, LUZ);
    gl.uniform3fv(this.u.uFondoNoche, hexRgb(PAPELES.noche.color));
    gl.uniform3fv(this.u.uTintaNoche, hexRgb(PAPELES.noche.tinta));

    // Malla de la hoja: suficientes divisiones para que el rollo se vea redondo.
    const cx = 64;
    const cy = 96;
    const uv = new Float32Array((cx + 1) * (cy + 1) * 2);
    let k = 0;
    for (let j = 0; j <= cy; j++) for (let i = 0; i <= cx; i++) {
      uv[k++] = i / cx;
      uv[k++] = j / cy;
    }
    const idx = new Uint16Array(cx * cy * 6);
    k = 0;
    for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      const a = j * (cx + 1) + i;
      const b = a + 1;
      const c = a + cx + 1;
      const d = c + 1;
      idx.set([a, b, d, a, d, c], k);
      k += 6;
    }
    this.nIndices = idx.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    this.texBlanca = this.crearTextura();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    this.texPapel = null;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
  }

  private crearTextura(repetir = false) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    const envolver = repetir ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, envolver);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, envolver);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  get tipoPapel() {
    return this.papel;
  }

  async ponerPapel(tipo: TipoPapel) {
    this.papel = tipo;
    const lienzo = await texturaPapel(tipo);
    if (this.perdido || this.papel !== tipo) return;
    const gl = this.gl;
    if (this.texPapel) gl.deleteTexture(this.texPapel);
    this.texPapel = this.crearTextura(true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lienzo);
    this.pedirDibujo();
  }

  /** Tamaño del lienzo (px CSS) y rectángulo de la hoja (la página derecha, en doble página). */
  medir(w: number, h: number, dpr: number, hoja: Rect, opciones: OpcionesVista = {}) {
    this.vista = { w, h, dpr };
    this.hojaRect = hoja;
    this.recortarLomo = !!opciones.recortarLomo;
    this.doble = !!opciones.doble;
    this.ajustarLienzo();
  }

  /** Acercamiento: la pantalla muestra (x, y) + zoom · lienzo (px CSS, y hacia abajo). */
  ponerZoom(z: number, x: number, y: number) {
    this.zoom = { z, x, y };
    this.pedirDibujo();
  }

  /**
   * Trozo de una página dibujado con más resolución, para que el zoom se vea nítido.
   * `rect` va en coordenadas de la página (0..1, y hacia arriba): x0, y0, x1, y1.
   */
  ponerDetalle(indice: number, fuente: TexImageSource | null, rect?: [number, number, number, number]) {
    const gl = this.gl;
    const previo = this.detalles.get(indice);
    if (!fuente || !rect) {
      if (previo && !this.perdido) gl.deleteTexture(previo.tex);
      this.detalles.delete(indice);
      this.pedirDibujo();
      return;
    }
    if (this.perdido) return;
    const tex = previo?.tex ?? this.crearTextura();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fuente);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.detalles.set(indice, { tex, fuente, rect });
    this.pedirDibujo();
  }

  quitarDetalles() {
    for (const i of [...this.detalles.keys()]) this.ponerDetalle(i, null);
  }

  private ajustarLienzo() {
    const { w, h, dpr } = this.vista;
    const escala = Math.max(1, dpr * this.calidad);
    const W = Math.round(w * escala);
    const H = Math.round(h * escala);
    if (this.lienzo.width !== W || this.lienzo.height !== H) {
      this.lienzo.width = W;
      this.lienzo.height = H;
    }
    this.pedirDibujo();
  }

  /**
   * Mide el ritmo mientras la hoja se mueve: si en un celular modesto baja de ~48 cuadros por
   * segundo, dibuja con menos píxeles (la página se ve casi igual y el gesto sigue fluido).
   */
  private medirRitmo() {
    const ahora = performance.now();
    const dt = ahora - this.ultimoCuadro;
    this.ultimoCuadro = ahora;
    if (dt > 100) return; // no venía animándose
    this.intervalos.push(dt);
    if (this.intervalos.length < 45) return;
    const orden = [...this.intervalos].sort((a, b) => a - b);
    const mediana = orden[orden.length >> 1];
    this.intervalos = [];
    if (mediana > 21 && this.vista.dpr * this.calidad > 1.3) {
      this.calidad *= 0.8;
      this.ajustarLienzo();
    }
  }

  subirPagina(indice: number, fuente: TexImageSource) {
    this.fuentes.set(indice, fuente);
    if (this.perdido) return;
    const gl = this.gl;
    let t = this.texPaginas.get(indice);
    if (!t) {
      t = this.crearTextura();
      this.texPaginas.set(indice, t);
    } else gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fuente);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (this.enEscena(indice)) this.pedirDibujo();
  }

  private enEscena(i: number) {
    const e = this.escena;
    return i === e.hoja || i === e.debajo || i === e.izquierda || i === e.reverso;
  }

  /** Marcas de una página (lienzo blanco con las marcas multiplicadas), o null si no tiene. */
  subirMarcas(indice: number, fuente: TexImageSource | null) {
    const gl = this.gl;
    if (!fuente) {
      const t = this.texMarcas.get(indice);
      if (t && !this.perdido) gl.deleteTexture(t);
      this.texMarcas.delete(indice);
      this.fuentesMarcas.delete(indice);
    } else {
      this.fuentesMarcas.set(indice, fuente);
      if (this.perdido) return;
      let t = this.texMarcas.get(indice);
      if (!t) {
        t = this.crearTextura();
        this.texMarcas.set(indice, t);
      } else gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fuente);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    if (this.enEscena(indice)) this.pedirDibujo();
  }

  tienePagina(indice: number) {
    return this.texPaginas.has(indice);
  }

  soltarPagina(indice: number) {
    const t = this.texPaginas.get(indice);
    if (t && !this.perdido) this.gl.deleteTexture(t);
    this.texPaginas.delete(indice);
    this.fuentes.delete(indice);
    this.subirMarcas(indice, null);
    if (this.detalles.has(indice)) this.ponerDetalle(indice, null);
  }

  soltarTodas() {
    for (const i of [...this.texPaginas.keys()]) this.soltarPagina(i);
  }

  poner(escena: Escena) {
    this.escena = escena;
    this.pedirDibujo();
  }

  pedirDibujo() {
    if (this.pedido) return;
    this.pedido = requestAnimationFrame(() => {
      this.pedido = 0;
      this.dibujar();
    });
  }

  dibujar() {
    if (this.perdido || !this.texPapel) return;
    const gl = this.gl;
    const { w, h } = this.vista;
    const r = this.hojaRect;
    const { z, x: zx, y: zy } = this.zoom;
    gl.viewport(0, 0, this.lienzo.width, this.lienzo.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.recortarLomo && !this.doble) {
      const escala = this.lienzo.width / w;
      const x = Math.max(0, Math.round((zx + z * r.x) * escala));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x, 0, Math.max(0, this.lienzo.width - x), this.lienzo.height);
    }
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uTam, r.w, r.h);
    gl.uniform2f(this.u.uOrigen, r.x, h - r.y - r.h);
    gl.uniform2f(this.u.uVista, w, h);
    gl.uniform1f(this.u.uZoom, z);
    gl.uniform2f(this.u.uPan, zx, h - zy - z * h);
    gl.uniform1f(this.u.uTipo, TIPO_NUM[this.papel]);
    gl.uniform1f(this.u.uDobleCara, this.doble ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texPapel);

    const { hoja, debajo, doblez, sombra, izquierda = null, reverso = null } = this.escena;
    const dob = doblez ?? { nx: 1, ny: 0, a: 1e6, r: 0 };
    gl.uniform2f(this.u.uN, dob.nx, dob.ny);
    gl.uniform1f(this.u.uA, dob.a);
    gl.uniform1f(this.u.uR, dob.r);
    gl.uniform1f(this.u.uSombra, sombra);
    gl.uniform1f(this.u.uDoblando, doblez ? 1 : 0);

    const atar = (unidad: number, t: WebGLTexture | null | undefined) => {
      gl.activeTexture(gl.TEXTURE0 + unidad);
      gl.bindTexture(gl.TEXTURE_2D, t || this.texBlanca);
    };
    const pintar = (indice: number | null, o: { doblar: boolean; z: number; izquierda?: boolean; reverso?: number | null }) => {
      const i = indice ?? -1;
      atar(2, this.texMarcas.get(i));
      atar(3, o.reverso != null ? this.texPaginas.get(o.reverso) : null);
      atar(4, o.reverso != null ? this.texMarcas.get(o.reverso) : null);
      // El detalle nítido solo va en páginas quietas (con la hoja en movimiento no se nota).
      const det = !doblez ? this.detalles.get(i) : undefined;
      atar(5, det?.tex);
      gl.uniform1f(this.u.uConDetalle, det ? 1 : 0);
      if (det) gl.uniform4fv(this.u.uDetalleRect, det.rect);
      atar(0, this.texPaginas.get(i));
      gl.uniform1f(this.u.uDoblar, o.doblar ? 1 : 0);
      gl.uniform1f(this.u.uZ, o.z);
      gl.uniform1f(this.u.uIzquierda, o.izquierda ? 1 : 0);
      gl.uniform1f(this.u.uDesplaza, o.izquierda ? -r.w : 0);
      gl.drawElements(gl.TRIANGLES, this.nIndices, gl.UNSIGNED_SHORT, 0);
    };
    // Primero la hoja de encima: así la GPU se salta lo que tapa de las páginas de abajo.
    if (hoja !== null) pintar(hoja, { doblar: true, z: 0, reverso: this.doble ? reverso : null });
    if (doblez && debajo !== null) pintar(debajo, { doblar: false, z: -1 });
    if (this.doble && izquierda !== null) pintar(izquierda, { doblar: false, z: -1, izquierda: true });
    if (doblez) this.medirRitmo();
  }

  destruir() {
    if (this.pedido) cancelAnimationFrame(this.pedido);
    this.soltarTodas();
    const ext = this.gl?.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}
