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
  hoja: number | null; // página que se ve encima (o que se está pasando)
  debajo: number | null; // página de abajo, mientras se pasa la hoja
  doblez: Doblez | null;
  sombra: number; // 0..1
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
      'uFondoNoche', 'uTintaNoche', 'uSombra', 'uDoblando', 'uLuz']) {
      this.u[nombre] = gl.getUniformLocation(prog, nombre);
    }
    gl.uniform1i(this.u.uPagina, 0);
    gl.uniform1i(this.u.uPapel, 1);
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

  /**
   * Tamaño del lienzo (px CSS) y rectángulo de la hoja dentro de él. Con `recortarLomo`, lo que
   * pasa del lomo hacia la izquierda no se dibuja (como en el celular, donde sale de la pantalla).
   */
  medir(w: number, h: number, dpr: number, hoja: Rect, recortarLomo = false) {
    this.vista = { w, h, dpr };
    this.hojaRect = hoja;
    this.recortarLomo = recortarLomo;
    this.ajustarLienzo();
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
    if (indice === this.escena.hoja || indice === this.escena.debajo) this.pedirDibujo();
  }

  tienePagina(indice: number) {
    return this.texPaginas.has(indice);
  }

  soltarPagina(indice: number) {
    const t = this.texPaginas.get(indice);
    if (t && !this.perdido) this.gl.deleteTexture(t);
    this.texPaginas.delete(indice);
    this.fuentes.delete(indice);
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
    gl.viewport(0, 0, this.lienzo.width, this.lienzo.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.recortarLomo) {
      const escala = this.lienzo.width / w;
      const x = Math.round(r.x * escala);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x, 0, this.lienzo.width - x, this.lienzo.height);
    }
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uTam, r.w, r.h);
    gl.uniform2f(this.u.uOrigen, r.x, h - r.y - r.h);
    gl.uniform2f(this.u.uVista, w, h);
    gl.uniform1f(this.u.uTipo, TIPO_NUM[this.papel]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texPapel);

    const { hoja, debajo, doblez, sombra } = this.escena;
    const dob = doblez ?? { nx: 1, ny: 0, a: 1e6, r: 0 };
    gl.uniform2f(this.u.uN, dob.nx, dob.ny);
    gl.uniform1f(this.u.uA, dob.a);
    gl.uniform1f(this.u.uR, dob.r);
    gl.uniform1f(this.u.uSombra, sombra);
    gl.uniform1f(this.u.uDoblando, doblez ? 1 : 0);

    const pintar = (indice: number | null, doblar: boolean, z: number) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, (indice !== null && this.texPaginas.get(indice)) || this.texBlanca);
      gl.uniform1f(this.u.uDoblar, doblar ? 1 : 0);
      gl.uniform1f(this.u.uZ, z);
      gl.drawElements(gl.TRIANGLES, this.nIndices, gl.UNSIGNED_SHORT, 0);
    };
    // Primero la hoja de encima: así la GPU se salta lo que tapa de la página de abajo.
    if (hoja !== null) pintar(hoja, true, 0);
    if (doblez && debajo !== null) pintar(debajo, false, -1);
    if (doblez) this.medirRitmo();
  }

  destruir() {
    if (this.pedido) cancelAnimationFrame(this.pedido);
    this.soltarTodas();
    const ext = this.gl?.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}
