// Pantalla de lectura: la hoja en WebGL, el gesto de pasarla, el zoom, las marcas, el sonido y el
// recuerdo de la página. En el celular, una página a la vez; en pantallas anchas, el libro abierto
// a doble página sobre la mesa, con barras fijas y el panel de Mis frases.

import { useCallback, useEffect, useRef, useState } from 'react';
import { leerArchivo } from '../datos/archivos';
import { guardarAvance, leerAvance, obtenerLibro, type Avance, type Libro } from '../datos/bd';
import { useAjustes } from '../estado/ajustes';
import { useFrases } from '../estado/frases';
import { useLibros } from '../estado/libros';
import { dibujarFrase, lienzoDeMarcas } from '../frases/dibujo';
import { Marcador, type Previa } from '../frases/marcador';
import type { Frase } from '../frases/modelo';
import { leerTextoPagina, type TextoPagina } from '../frases/texto';
import type { Sentido } from '../hoja/geometria';
import { Gestos } from '../hoja/gestos';
import { densidad, disponer, esCelular, pliego, type Caja, type Disposicion } from '../hoja/maqueta';
import { MotorHoja, type Escena } from '../hoja/motor';
import { Pasador, type Pase } from '../hoja/pasador';
import { acercarEn, aLienzo, conZoom, desplazable, encuadrar, limitar, SIN_ZOOM, zoomAlTexto, type Encuadre, type Zoom } from '../hoja/zoom';
import { capituloDe, leerCapitulos, type Capitulo } from '../pdf/indice';
import { abrirPdf, bytesLeidos, cerrarPdf, type DocumentoPdf } from '../pdf/pdf';
import { Paginas } from '../pdf/paginas';
import { ambiente } from '../sonido/ambiente';
import { sonido } from '../sonido/sonido';
import { AvisoBreve, AvisoModo, type Mensaje } from './Avisos';
import { Icono } from './Icono';
import { MenuEsquina } from './MenuEsquina';
import { PanelFrases } from './PanelFrases';
import { PapelYSonido } from './PapelYSonido';
import { margenesSeguros } from './seguro';

const miles = (n: number) => n.toLocaleString('es');

/**
 * PDF.js guarda en memoria cada parte del archivo que ya leyó. Pasado este límite, el libro se
 * vuelve a abrir en silencio para soltar esa memoria (importa con libros escaneados enormes).
 */
const LIMITE_LEIDO = (import.meta.env.DEV && (globalThis as { __limiteLeido?: number }).__limiteLeido) || 160e6;

const PANEL = 340; // ancho del panel de Mis frases

/**
 * Cómo se ve la página: entera («pagina»), con el texto a todo el ancho («texto», doble toque) o
 * con el zoom que dejó el pellizco («libre»). Se mantiene al pasar las hojas.
 */
type Ajuste = 'pagina' | 'texto' | 'libre';
type Donde = 'arriba' | 'abajo' | { px: number; py: number };
const BARRA_ARRIBA = 52;
const BARRA_ABAJO = 56;

export function Lector({ libroId, paginaPedida, desde }: { libroId: string; paginaPedida?: number; desde?: 'inicio' | 'frases' }) {
  const volver = useLibros((s) => s.volver);
  const verFrases = useLibros((s) => s.verFrases);
  const anotarAvance = useLibros((s) => s.anotarAvance);
  const papel = useAjustes((s) => s.papel);
  const panelFrases = useAjustes((s) => s.panelFrases);
  const herramienta = useFrases((s) => s.herramienta);

  const contenedor = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const lienzoPrevia = useRef<HTMLCanvasElement>(null);
  const sombraLibro = useRef<HTMLDivElement>(null);

  const [libro, setLibro] = useState<Libro | null>(null);
  const [doc, setDoc] = useState<DocumentoPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagina, setPagina] = useState<number | null>(null);
  const [disp, setDisp] = useState<Disposicion | null>(null);
  const [anchoVentana, setAnchoVentana] = useState(window.innerWidth);
  const [cromo, setCromo] = useState(false);
  const [panel, setPanel] = useState(false);
  const [dibujada, setDibujada] = useState(false);
  const [saltoA, setSaltoA] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [hayZoom, setHayZoom] = useState(false);
  const [capitulos, setCapitulos] = useState<Capitulo[]>([]);
  const [ajuste, setAjuste] = useState<Ajuste>(() => (useAjustes.getState().ajusteTexto ? 'texto' : 'pagina'));
  const cerrarMensaje = useCallback(() => setMensaje(null), []);

  const motor = useRef<MotorHoja | null>(null);
  const paginas = useRef<Paginas | null>(null);
  const pasador = useRef<Pasador | null>(null);
  const marcador = useRef<Marcador | null>(null);
  const gestos = useRef<Gestos | null>(null);
  const paginaRef = useRef(0);
  const dispRef = useRef<Disposicion | null>(null);
  const zoomRef = useRef<Zoom>(SIN_ZOOM);
  const ajusteRef = useRef<Ajuste>(ajuste);
  /** La página aún no estaba medida al encuadrarla: se encuadra de nuevo cuando llegue. */
  const encuadrePendiente = useRef<'arriba' | 'abajo' | null>(null);
  const animZoom = useRef(0);
  const detalleQuieto = useRef(0);
  const textos = useRef(new Map<number, TextoPagina | 'leyendo'>());
  const borradasGesto = useRef<Frase[]>([]);
  /** Página en la que se está marcando (en doble página puede ser la izquierda o la derecha). */
  const marcaPagina = useRef<{ indice: number; rect: Caja } | null>(null);

  const archivoRef = useRef<Blob | null>(null);
  const docActual = useRef<DocumentoPdf | null>(null);
  const reciclando = useRef(false);
  const totalRef = useRef(0);

  const esDoble = () => dispRef.current?.modo === 'doble';
  const enMesa = disp?.modo === 'mesa' || disp?.modo === 'doble';
  const conPanel = enMesa && panelFrases && anchoVentana >= 1100;

  // ---------- 1. Abrir el libro guardado, por partes, en la página donde me quedé ----------
  useEffect(() => {
    let vivo = true;
    (async () => {
      const l = await obtenerLibro(libroId);
      if (!l) throw new Error('Este libro ya no está en el estante.');
      const archivo = await leerArchivo(l.id, l.almacen);
      if (!archivo) throw new Error('No se encontró el archivo de este libro en el dispositivo.');
      const d = await abrirPdf(archivo);
      if (!vivo) return cerrarPdf(d);
      archivoRef.current = archivo;
      docActual.current = d;
      totalRef.current = d.numPages;
      const av = await leerAvance(l.id);
      if (!vivo) return;
      const inicial = Math.max(0, Math.min(d.numPages - 1, paginaPedida ?? av?.pagina ?? 0));
      paginaRef.current = inicial;
      setLibro(l);
      setDoc(d);
      setPagina(inicial);
      void leerCapitulos(d).then((c) => vivo && setCapitulos(c));
    })().catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo abrir el libro.'));
    return () => {
      vivo = false;
      cerrarPdf(docActual.current);
      docActual.current = null;
    };
  }, [libroId]);

  const revisarMemoria = useCallback(async () => {
    const viejo = docActual.current;
    const archivo = archivoRef.current;
    if (!viejo || !archivo || reciclando.current || bytesLeidos(viejo) < LIMITE_LEIDO) return;
    reciclando.current = true;
    try {
      const nuevo = await abrirPdf(archivo);
      if (docActual.current !== viejo) return cerrarPdf(nuevo);
      paginas.current?.cambiarDocumento(nuevo);
      docActual.current = nuevo;
      cerrarPdf(viejo);
      if (import.meta.env.DEV) console.info(`Libro reabierto para soltar memoria (${Math.round(bytesLeidos(viejo) / 1e6)} MB leídos)`);
    } catch (e) {
      console.warn('No se pudo volver a abrir el libro', e);
    } finally {
      reciclando.current = false;
    }
  }, []);

  // ---------- Qué páginas se ven ----------
  const escenaQuieta = useCallback((): Escena => {
    const p = paginaRef.current;
    const n = totalRef.current;
    if (esDoble()) {
      const { izquierda, derecha } = pliego(p);
      return { hoja: derecha < n ? derecha : null, izquierda: izquierda >= 0 ? izquierda : null, debajo: null, doblez: null, sombra: 0 };
    }
    return { hoja: p, debajo: null, doblez: null, sombra: 0 };
  }, []);

  const visibles = () => {
    const p = paginaRef.current;
    if (!esDoble()) return [p];
    const { izquierda, derecha } = pliego(p);
    return [izquierda, derecha].filter((i) => i >= 0 && i < totalRef.current);
  };

  // ---------- Zoom ----------
  const vistaTam = () => {
    const el = contenedor.current;
    return el && el.clientWidth ? { w: el.clientWidth, h: el.clientHeight } : null;
  };

  /** ¿La vista se puede mover? (con zoom, o de lado, con la hoja más alta que la pantalla). */
  const sePuedeMover = () => {
    const d = dispRef.current;
    const v = vistaTam();
    return !!d && !!v && desplazable(zoomRef.current, d.libro, v);
  };

  /** Dónde está el texto de la página (px CSS del lienzo) y qué ancho tiene el texto de este libro. */
  const encuadreDe = (i: number): Encuadre | null => {
    const pags = paginas.current;
    const d = dispRef.current;
    if (!pags || !d) return null;
    const r = pags.rectPagina(i) ?? d.caja;
    const c = pags.contenido(i);
    const k = c ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
    const texto = { x: d.hoja.x + r.x + k.x0 * r.w, y: d.hoja.y + r.y + k.y0 * r.h, w: (k.x1 - k.x0) * r.w, h: (k.y1 - k.y0) * r.h };
    // El ancho típico del texto del libro (sin las páginas casi vacías, como las de un título):
    // así el tamaño de la letra no salta de una página a otra.
    const anchos = pags
      .contenidosMedidos()
      .map((m) => m.x1 - m.x0)
      .filter((a) => a > 0.35)
      .sort((a, b) => a - b);
    const tipico = anchos.length ? anchos[Math.floor(anchos.length / 2)] * r.w : 0;
    const s = margenesSeguros();
    return {
      texto,
      ancho: Math.max(c ? texto.w : 0, tipico) || texto.w,
      margen: { lado: 8, arriba: s.arriba + 10, abajo: s.abajo + 10 },
    };
  };

  /** A dónde va la vista para la página actual, según el ajuste. */
  const objetivo = (donde: Donde): Zoom | null => {
    const d = dispRef.current;
    const v = vistaTam();
    if (!d || !v) return null;
    const doble = d.modo === 'doble';
    const e = doble ? null : encuadreDe(paginaRef.current);
    const a = ajusteRef.current;
    let z: Zoom;
    if (a === 'texto' && e) {
      const zz = zoomAlTexto(e, v);
      const punto = typeof donde === 'object' ? { py: donde.py, y: aLienzo(zoomRef.current, donde.px, donde.py).y } : donde;
      z = encuadrar(zz, e, v, punto);
    } else {
      const base = a === 'libre' ? zoomRef.current : SIN_ZOOM;
      if (typeof donde === 'object') z = acercarEn(zoomRef.current, base.z, donde.px, donde.py);
      else if (!e) z = { ...base, y: donde === 'arriba' ? 1e7 : -1e7 };
      else {
        // Con zoom libre, la página nueva empieza donde empiezan los renglones (y al volver, donde terminan).
        const cabe = base.z * e.texto.w <= v.w - 2 * e.margen.lado;
        const x = cabe
          ? v.w / 2 - base.z * (e.texto.x + e.texto.w / 2)
          : donde === 'arriba'
            ? e.margen.lado - base.z * e.texto.x
            : v.w - e.margen.lado - base.z * (e.texto.x + e.texto.w);
        z = {
          z: base.z,
          x: a === 'libre' ? x : base.x,
          y: donde === 'arriba' ? e.margen.arriba - base.z * e.texto.y : v.h - e.margen.abajo - base.z * (e.texto.y + e.texto.h),
        };
      }
    }
    return limitar(z, d.libro, v);
  };

  const aplicarZoom = useCallback((z: Zoom) => {
    zoomRef.current = z;
    motor.current?.ponerZoom(z.z, z.x, z.y);
    const transformar = (el: HTMLElement | null, r: Caja | undefined) => {
      if (!el || !r) return;
      el.style.transform = `translate(${z.x + z.z * r.x}px, ${z.y + z.z * r.y}px) scale(${z.z})`;
    };
    transformar(sombraLibro.current, dispRef.current?.libro);
    transformar(lienzoPrevia.current, marcaPagina.current?.rect ?? dispRef.current?.hoja);
    setHayZoom(conZoom(z));
  }, []);

  /** Las páginas se dibujan a la medida de la pantalla; con zoom (o de lado) hace falta más detalle. */
  const necesitaDetalle = (z: Zoom) => {
    const tam = paginas.current?.lienzoTam;
    return !!tam && tam.dpr < Math.min(window.devicePixelRatio || 1, 2.5) * z.z * 0.95;
  };

  const pintarDetalle = useCallback(() => {
    const m = motor.current;
    const pags = paginas.current;
    const d = dispRef.current;
    const el = contenedor.current;
    if (!m || !pags || !d || !el) return;
    const z = zoomRef.current;
    if (!necesitaDetalle(z)) return m.quitarDetalles();
    const tam = pags.lienzoTam;
    if (!tam) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const k = Math.min(window.devicePixelRatio || 1, 2.5) * z.z;
    // Lo visible y un poco más arriba y abajo: al deslizar un poco, sigue nítido.
    const extra = (0.35 * vh) / z.z;
    for (const i of visibles()) {
      const izquierda = esDoble() && i === pliego(paginaRef.current).izquierda;
      const r = izquierda ? { ...d.hoja, x: d.hoja.x - d.hoja.w } : d.hoja;
      // Parte visible de la página, en px CSS de la hoja.
      const a = aLienzo(z, 0, 0);
      const b = aLienzo(z, vw, vh);
      const x0 = Math.max(r.x, a.x);
      const y0 = Math.max(r.y, a.y - extra);
      const x1 = Math.min(r.x + r.w, b.x);
      const y1 = Math.min(r.y + r.h, b.y + extra);
      if (x1 - x0 < 2 || y1 - y0 < 2) {
        m.ponerDetalle(i, null);
        continue;
      }
      const region = { x: x0 - r.x, y: y0 - r.y, w: x1 - x0, h: y1 - y0 };
      const kk = Math.min(k, Math.sqrt(9e6 / (region.w * region.h)));
      void pags.dibujarDetalle(i, region, kk).then((res) => {
        if (res && necesitaDetalle(zoomRef.current)) m.ponerDetalle(i, res.lienzo, res.rect);
      });
    }
  }, []);

  const programarDetalle = useCallback(() => {
    clearTimeout(detalleQuieto.current);
    detalleQuieto.current = window.setTimeout(pintarDetalle, 150);
  }, [pintarDetalle]);

  const ponerZoom = useCallback(
    (z: Zoom, animar = false) => {
      const d = dispRef.current;
      const el = contenedor.current;
      if (!d || !el) return;
      const destino = limitar(z, d.libro, { w: el.clientWidth, h: el.clientHeight });
      cancelAnimationFrame(animZoom.current);
      if (!animar) return aplicarZoom(destino);
      const desdeZ = zoomRef.current;
      const t0 = performance.now();
      const paso = () => {
        const t = Math.min(1, (performance.now() - t0) / 240);
        const e = 1 - Math.pow(1 - t, 3);
        aplicarZoom({ z: desdeZ.z + (destino.z - desdeZ.z) * e, x: desdeZ.x + (destino.x - desdeZ.x) * e, y: desdeZ.y + (destino.y - desdeZ.y) * e });
        if (t < 1) animZoom.current = requestAnimationFrame(paso);
        else programarDetalle();
      };
      animZoom.current = requestAnimationFrame(paso);
    },
    [aplicarZoom, programarDetalle],
  );

  const quitarZoom = useCallback(() => {
    cancelAnimationFrame(animZoom.current);
    aplicarZoom(SIN_ZOOM);
    motor.current?.quitarDetalles();
  }, [aplicarZoom]);

  const cambiarAjuste = (a: Ajuste) => {
    ajusteRef.current = a;
    setAjuste(a);
    useAjustes.getState().poner({ ajusteTexto: a === 'texto' });
  };

  /** Pone la vista donde corresponde para la página actual (y la recuerda si aún no está medida). */
  const reencuadrar = (donde: Donde, animar: boolean) => {
    const z = objetivo(donde);
    if (!z) return;
    const i = paginaRef.current;
    encuadrePendiente.current = typeof donde !== 'object' && paginas.current?.contenido(i) === undefined ? donde : null;
    ponerZoom(z, animar);
    if (!animar) programarDetalle();
  };
  const reencuadrarRef = useRef(reencuadrar);
  reencuadrarRef.current = reencuadrar;

  // Para las pruebas automáticas (solo en desarrollo): el estado de la vista.
  if (import.meta.env.DEV)
    (globalThis as { __lector?: unknown }).__lector = {
      zoom: () => zoomRef.current,
      pagina: () => paginaRef.current,
      ajuste: () => ajusteRef.current,
      texto: () => encuadreDe(paginaRef.current),
    };

  // ---------- 2. Motor WebGL, páginas, marcas y gestos ----------
  useEffect(() => {
    if (!doc || !libro || !lienzo.current) return;
    let m: MotorHoja;
    try {
      m = new MotorHoja(lienzo.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar la hoja.');
      return;
    }
    motor.current = m;
    void m.ponerPapel(useAjustes.getState().papel);

    const pags = new Paginas(docActual.current ?? doc);
    paginas.current = pags;

    // Marcas de cada página: un lienzo blanco con sus frases, que el shader multiplica con la página.
    const lienzosMarcas = new Map<number, HTMLCanvasElement>();
    const pintarMarcas = (i: number) => {
      const ub = pags.ubicacion(i);
      const tam = pags.lienzoTam;
      if (!ub || !tam) return;
      const fs = useFrases.getState().frases.filter((f) => f.libroId === libro.id && f.pagina === i);
      if (!fs.length) {
        lienzosMarcas.delete(i);
        m.subirMarcas(i, null);
        return;
      }
      const c = lienzoDeMarcas(tam.ancho, tam.alto, fs, { x: ub.x, y: ub.y, escala: ub.escala, dpr: tam.dpr }, lienzosMarcas.get(i));
      lienzosMarcas.set(i, c);
      m.subirMarcas(i, c);
    };
    const dejarDeEscuchar = useFrases.subscribe((ahora, antes) => {
      if (ahora.frases !== antes.frases) pags.indices().forEach(pintarMarcas);
    });

    pags.onLista = (i, c) => {
      m.subirPagina(i, c);
      pintarMarcas(i);
      if (visibles().includes(i)) {
        setDibujada(visibles().every((j) => !!pags.obtener(j)));
        const pendiente = encuadrePendiente.current;
        if (i === paginaRef.current && pendiente && !gestos.current?.ocupado && !p.ocupado) reencuadrarRef.current(pendiente, true);
        else if (necesitaDetalle(zoomRef.current)) programarDetalle();
      }
    };
    pags.onSoltada = (i) => {
      lienzosMarcas.delete(i);
      m.soltarPagina(i);
    };

    const quieta = () => m.poner(escenaQuieta());

    const p = new Pasador({
      tamano: () => {
        const h = dispRef.current?.hoja;
        return { w: h?.w ?? 1, h: h?.h ?? 1 };
      },
      doble: esDoble,
      puede: (s) => {
        const n = totalRef.current;
        const pa = paginaRef.current;
        if (esDoble()) {
          const { izquierda, derecha } = pliego(pa);
          return s === 'adelante' ? derecha + 1 < n : izquierda >= 1;
        }
        return s === 'adelante' ? pa < n - 1 : pa > 0;
      },
      alCambiar: (pase: Pase | null) => {
        if (!pase) return quieta();
        const n = totalRef.current;
        const pa = paginaRef.current;
        const { doblez, sombra } = pase;
        if (esDoble()) {
          const { izquierda: iz, derecha: de } = pliego(pa);
          const o = (i: number) => (i >= 0 && i < n ? i : null);
          m.poner(
            pase.sentido === 'adelante'
              ? { hoja: de, reverso: o(de + 1), debajo: o(de + 2), izquierda: o(iz), doblez, sombra }
              : { hoja: o(iz - 1), reverso: iz, debajo: o(de), izquierda: o(iz - 2), doblez, sombra },
          );
          return;
        }
        m.poner(pase.sentido === 'adelante' ? { hoja: pa, debajo: pa + 1, doblez, sombra } : { hoja: pa - 1, debajo: pa, doblez, sombra });
      },
      alTerminar: (s: Sentido, paso: boolean) => {
        sonido.pararRoce();
        if (paso) {
          if (esDoble()) {
            const { izquierda, derecha } = pliego(paginaRef.current);
            paginaRef.current = s === 'adelante' ? derecha + 1 : Math.max(0, izquierda - 2);
          } else paginaRef.current += s === 'adelante' ? 1 : -1;
          setPagina(paginaRef.current);
          void revisarMemoria();
        }
        quieta();
        // Con zoom o de lado, la página nueva se empieza a leer desde arriba (o desde abajo, al volver).
        if (paso && sePuedeMover()) reencuadrarRef.current(s === 'adelante' ? 'arriba' : 'abajo', true);
      },
      alEmpezar: () => {
        setCromo(false);
        sonido.empezarRoce();
      },
      alMover: (v) => sonido.moverRoce(v),
      alAsentar: (f) => {
        sonido.pararRoce();
        sonido.golpe(f);
      },
    });
    pasador.current = p;

    const mk = new Marcador({
      herramienta: () => useFrases.getState().herramienta,
      color: () => {
        const a = useAjustes.getState();
        return useFrases.getState().herramienta === 'lapiz' ? a.colorLapiz : a.colorResaltador;
      },
      libroId: () => libro.id,
      pagina: () => marcaPagina.current?.indice ?? paginaRef.current,
      ubicacion: () => pags.ubicacion(marcaPagina.current?.indice ?? paginaRef.current),
      texto: () => {
        const t = textos.current.get(marcaPagina.current?.indice ?? paginaRef.current);
        return t && t !== 'leyendo' ? t : null;
      },
      lienzoPagina: () => {
        const l = pags.obtener(marcaPagina.current?.indice ?? paginaRef.current);
        const tam = pags.lienzoTam;
        return l && tam ? { lienzo: l, dpr: tam.dpr } : undefined;
      },
      frasesPagina: () => {
        const i = marcaPagina.current?.indice ?? paginaRef.current;
        return useFrases.getState().frases.filter((f) => f.libroId === libro.id && f.pagina === i);
      },
      previa: (pv) => dibujarPrevia(pv),
      guardar: (f, donde) => {
        void useFrases.getState().agregar({ ...f, libroTitulo: libro.titulo });
        // La marca ya quedó en la página: la vista previa se borra en cuanto se dibuja.
        requestAnimationFrame(() => requestAnimationFrame(() => dibujarPrevia(null)));
        const r = contenedor.current?.getBoundingClientRect();
        const rect = marcaPagina.current?.rect ?? dispRef.current?.hoja;
        const z = zoomRef.current;
        setMensaje({
          texto: 'Guardada en Mis frases',
          x: (r?.left ?? 0) + z.x + z.z * ((rect?.x ?? 0) + donde.x),
          y: (r?.top ?? 0) + z.y + z.z * ((rect?.y ?? 0) + donde.y),
          clave: Date.now(),
        });
      },
      borrar: (ids) => {
        void useFrases
          .getState()
          .quitar(ids)
          .then((quitadas) => {
            borradasGesto.current.push(...quitadas);
            const deshacer = [...borradasGesto.current];
            setMensaje({
              texto: deshacer.length > 1 ? `${deshacer.length} marcas borradas` : 'Marca borrada',
              deshacer: () => void useFrases.getState().restaurar(deshacer),
              clave: Date.now(),
            });
          });
      },
    });
    marcador.current = mk;

    // Del lector (px CSS) a la hoja: pasar la hoja usa y hacia arriba, con el lomo en x = 0.
    // Con mucho zoom, el recorrido del dedo se amplía (como si el zoom fuera 1,15): si no, no
    // alcanzaría la pantalla para llevar la hoja hasta la mitad.
    let arrastre: { pantalla: { x: number; y: number }; lienzo: { x: number; y: number }; factor: number } | null = null;
    const aHoja = (x: number, y: number) => {
      const z = zoomRef.current;
      const a = arrastre;
      const c = a
        ? { x: a.lienzo.x + ((x - a.pantalla.x) * a.factor) / z.z, y: a.lienzo.y + ((y - a.pantalla.y) * a.factor) / z.z }
        : aLienzo(z, x, y);
      const h = dispRef.current?.hoja ?? { x: 0, y: 0, w: 1, h: 1 };
      return { x: c.x - h.x, y: h.y + h.h - c.y };
    };

    /** ¿Ya se ve el borde del texto hacia donde va el dedo? Entonces el dedo pasa la hoja. */
    const puedePasar = (s: Sentido) => {
      const d = dispRef.current;
      const v = vistaTam();
      if (!d || !v) return true;
      const z = zoomRef.current;
      const t = d.modo === 'doble' ? d.libro : (encuadreDe(paginaRef.current)?.texto ?? d.hoja);
      const tolerancia = 14;
      return s === 'adelante' ? z.x + z.z * (t.x + t.w) <= v.w + tolerancia : z.x + z.z * t.x >= -tolerancia;
    };

    gestos.current = new Gestos({
      zoom: () => zoomRef.current,
      ponerZoom: (z, animar) => ponerZoom(z, animar),
      herramienta: () => !!useFrases.getState().herramienta,
      desplazable: sePuedeMover,
      puedePasar,
      alTocar: () => cancelAnimationFrame(animZoom.current),
      pasar: {
        bajar: (x, y, id) => {
          const z = zoomRef.current;
          arrastre = null;
          const q = aHoja(x, y);
          arrastre = { pantalla: { x, y }, lienzo: aLienzo(z, x, y), factor: Math.max(1, z.z / 1.15) };
          const d = dispRef.current;
          // Sobre la mesa solo se toma el libro (con un poco de margen afuera).
          if (d && d.modo !== 'celular') {
            const izq = d.modo === 'doble' ? -d.hoja.w - 24 : -4;
            if (q.x < izq || q.x > d.hoja.w + 24 || q.y < -16 || q.y > d.hoja.h + 16) return;
          }
          p.bajar(q.x, q.y, id);
        },
        mover: (x, y, id) => {
          const q = aHoja(x, y);
          p.mover(q.x, q.y, id);
        },
        subir: (x, y, id) => {
          const q = aHoja(x, y);
          p.subir(q.x, q.y, id);
        },
        cancelar: () => p.cancelar(),
      },
      marcar: {
        bajar: (x, y, id) => {
          if (p.ocupado) return;
          const c = aLienzo(zoomRef.current, x, y);
          const d = dispRef.current;
          if (!d) return;
          const { izquierda, derecha } = pliego(paginaRef.current);
          const enIzquierda = d.modo === 'doble' && c.x < d.hoja.x;
          const indice = d.modo === 'doble' ? (enIzquierda ? izquierda : derecha) : paginaRef.current;
          if (indice < 0 || indice >= totalRef.current) return;
          const rect = enIzquierda ? { ...d.hoja, x: d.hoja.x - d.hoja.w } : d.hoja;
          marcaPagina.current = { indice, rect };
          aplicarZoom(zoomRef.current); // la vista previa va sobre esta página
          borradasGesto.current = [];
          mk.bajar(c.x - rect.x, c.y - rect.y, id);
        },
        mover: (x, y, id) => {
          const c = aLienzo(zoomRef.current, x, y);
          const r = marcaPagina.current?.rect;
          if (r) mk.mover(c.x - r.x, c.y - r.y, id);
        },
        subir: (_x, _y, id) => mk.subir(id),
        cancelar: () => mk.cancelar(),
      },
      tocar: () => {
        const d = dispRef.current;
        if (!useFrases.getState().herramienta && d?.modo === 'celular') setCromo((c) => !c);
      },
      dobleToque: (x, y) => {
        if (useFrases.getState().herramienta) return;
        const d = dispRef.current;
        const v = vistaTam();
        if (!d || !v) return;
        // Con zoom: vuelve a la página entera, dejando quieto el punto tocado.
        if (ajusteRef.current !== 'pagina' || conZoom(zoomRef.current)) {
          cambiarAjuste('pagina');
          reencuadrar({ px: x, py: y }, true);
          return;
        }
        // Sin zoom: el texto a todo el ancho de la pantalla, sin cortar nada a los lados.
        if (d.modo === 'doble') {
          cambiarAjuste('libre');
          ponerZoom(acercarEn(zoomRef.current, 2, x, y), true);
          return;
        }
        const e = encuadreDe(paginaRef.current);
        if (e && zoomAlTexto(e, v) > 1.03) {
          cambiarAjuste('texto');
          reencuadrar({ px: x, py: y }, true);
          setMensaje({ texto: 'Texto a todo el ancho · doble toque para volver', clave: Date.now() });
        } else {
          setMensaje({
            texto: v.w < v.h ? 'El texto ya ocupa todo el ancho · gira el celular para verlo más grande' : 'El texto ya ocupa todo el ancho',
            clave: Date.now(),
          });
        }
      },
      finPellizco: () => {
        const z = zoomRef.current;
        const v = vistaTam();
        if (!v) return;
        const d = dispRef.current;
        const e = d && d.modo !== 'doble' ? encuadreDe(paginaRef.current) : null;
        const ajuste = e ? zoomAlTexto(e, v) : 1;
        if (z.z < 1.08) {
          cambiarAjuste('pagina');
          ponerZoom(acercarEn(z, 1, v.w / 2, v.h / 2), true);
        } else if (e && ajuste > 1.03 && z.z < ajuste * 1.45) {
          // Cerca del ancho del texto: se acomoda justo ahí, sin cortar nada a los lados.
          cambiarAjuste('texto');
          reencuadrar({ px: v.w / 2, py: v.h / 2 }, true);
        } else cambiarAjuste('libre');
      },
      finZoom: programarDetalle,
    });

    quieta();

    return () => {
      dejarDeEscuchar();
      gestos.current?.destruir();
      gestos.current = null;
      marcador.current = null;
      p.destruir();
      pags.destruir();
      m.destruir();
      motor.current = null;
      paginas.current = null;
      pasador.current = null;
    };
  }, [doc, libro, revisarMemoria, escenaQuieta, ponerZoom, aplicarZoom, programarDetalle]);

  // ---------- 3. Medir la pantalla y acomodar el libro (también al girar el celular) ----------
  useEffect(() => {
    if (!doc || !libro) return;
    const el = contenedor.current;
    if (!el) return;
    let aspecto = 0.7;
    let vivo = true;
    void doc.getPage(1).then((pg) => {
      const v = pg.getViewport({ scale: 1 });
      aspecto = v.width / v.height;
      if (vivo) medir();
    });
    const medir = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      setAnchoVentana(window.innerWidth);
      const ancha = !esCelular(w, h);
      const d = disponer(w, h, margenesSeguros(), aspecto, ancha ? { barraArriba: BARRA_ARRIBA, barraAbajo: BARRA_ABAJO } : {});
      // Las páginas se dibujan a la medida de la hoja (de lado es más alta que la pantalla: menos
      // densidad, y el detalle nítido se agrega encima); el lienzo, siempre a la de la pantalla.
      const dpr = densidad(window.devicePixelRatio, d.hoja.w, d.hoja.h);
      const dprLienzo = densidad(window.devicePixelRatio, w, h);
      const cambioModo = dispRef.current?.modo !== d.modo;
      dispRef.current = d;
      setDisp(d);
      pasador.current?.cancelar();
      marcador.current?.cancelar();
      quitarZoom();
      motor.current?.medir(w, h, dprLienzo, d.hoja, { recortarLomo: d.modo === 'mesa', doble: d.modo === 'doble' });
      paginas.current?.configurar({ ancho: d.hoja.w, alto: d.hoja.h, dpr, caja: d.caja, titulo: libro.titulo });
      if (cambioModo) {
        motor.current?.poner(escenaQuieta());
        pedirPaginas();
      }
      // Al girar el celular se conserva el ajuste (el texto a todo el ancho sigue así).
      if (ajusteRef.current === 'libre') cambiarAjuste('pagina');
      reencuadrarRef.current('arriba', false);
    };
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    medir();
    return () => {
      vivo = false;
      obs.disconnect();
    };
  }, [doc, libro, escenaQuieta, quitarZoom]);

  // ---------- 4. Al cambiar de página: dibujar las vecinas y recordar dónde voy ----------
  const pedirPaginas = () => {
    const p = paginaRef.current;
    if (esDoble()) {
      const { izquierda: iz, derecha: de } = pliego(p);
      paginas.current?.pedir([de, iz, de + 1, de + 2, iz - 1, iz - 2]);
    } else paginas.current?.pedir([p, p + 1, p - 1, p + 2, p - 2]);
    setDibujada(visibles().every((i) => !!paginas.current?.obtener(i)));
  };

  const pendiente = useRef<Avance | null>(null);
  const anotar = useCallback(() => {
    const avance = pendiente.current;
    if (!avance) return;
    pendiente.current = null;
    void guardarAvance(avance);
    anotarAvance(avance);
  }, [anotarAvance]);

  const capitulo = pagina !== null ? capituloDe(capitulos, pagina) : undefined;

  useEffect(() => {
    if (pagina === null || !doc || !libro) return;
    pedirPaginas();
    motor.current?.quitarDetalles();
    if (necesitaDetalle(zoomRef.current)) programarDetalle();
    pendiente.current = { libroId: libro.id, pagina, total: doc.numPages, actualizado: Date.now(), capitulo };
    const t = setTimeout(anotar, 250);
    return () => clearTimeout(t);
    // pedirPaginas lee refs: no hace falta como dependencia.
  }, [pagina, doc, libro, anotar, capitulo]);

  // Al salir del libro o de la app, lo último queda guardado.
  useEffect(() => {
    const alOcultar = () => document.visibilityState === 'hidden' && anotar();
    document.addEventListener('visibilitychange', alOcultar);
    window.addEventListener('pagehide', anotar);
    return () => {
      document.removeEventListener('visibilitychange', alOcultar);
      window.removeEventListener('pagehide', anotar);
      anotar();
    };
  }, [anotar]);

  useEffect(() => {
    void motor.current?.ponerPapel(papel);
  }, [papel]);

  // Sonido de fondo de este libro: suena mientras se lee y se calla al salir o al cambiar de app.
  const ambienteLibro = useLibros((s) => s.libros.find((l) => l.id === libroId)?.ambiente ?? null);
  useEffect(() => {
    const aplicar = () => ambiente.poner(document.visibilityState === 'visible' ? ambienteLibro : null);
    aplicar();
    document.addEventListener('visibilitychange', aplicar);
    return () => {
      document.removeEventListener('visibilitychange', aplicar);
      ambiente.poner(null);
    };
  }, [ambienteLibro]);

  // Con el resaltador o el lápiz se lee la capa de texto de las páginas visibles (una vez por página).
  useEffect(() => {
    const d = docActual.current;
    if (pagina === null || !d || (herramienta !== 'resaltador' && herramienta !== 'lapiz')) return;
    const cache = textos.current;
    for (const i of visibles()) {
      if (cache.has(i)) continue;
      cache.set(i, 'leyendo');
      d.getPage(i + 1)
        .then(leerTextoPagina)
        .then((t) => cache.set(i, t))
        .catch(() => cache.delete(i));
    }
    // Solo se guardan unas pocas páginas.
    while (cache.size > 12) cache.delete(cache.keys().next().value!);
  }, [pagina, herramienta, doc, disp?.modo]);

  useEffect(() => {
    if (herramienta) setCromo(false);
    marcador.current?.cancelar();
  }, [herramienta]);

  // Al salir del libro se vuelve a leer: la próxima vez el dedo pasa la hoja.
  useEffect(() => () => useFrases.getState().usar(null), []);

  /** Vista previa de la marca mientras el dedo la hace (encima de la página que se marca). */
  const dibujarPrevia = useCallback((pv: Previa) => {
    const c = lienzoPrevia.current;
    const pags = paginas.current;
    const mp = marcaPagina.current;
    if (!c || !pags || !mp) return;
    const tam = pags.lienzoTam;
    const ub = pags.ubicacion(mp.indice);
    if (!tam || !ub) return;
    if (c.width !== tam.ancho || c.height !== tam.alto) {
      c.width = tam.ancho;
      c.height = tam.alto;
    }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!pv) return;
    ctx.globalCompositeOperation = 'multiply';
    dibujarFrase(ctx, { id: 'previa', ...pv }, { x: ub.x, y: ub.y, escala: ub.escala, dpr: tam.dpr });
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const irA = useCallback(
    (n: number) => {
      if (!doc) return;
      const destino = Math.max(0, Math.min(doc.numPages - 1, n));
      paginaRef.current = destino;
      setPagina(destino);
      void revisarMemoria();
      motor.current?.poner(escenaQuieta());
      reencuadrarRef.current('arriba', false);
    },
    [doc, revisarMemoria, escenaQuieta],
  );

  // ---------- 5. Teclado: ← → pasan la hoja; Ctrl + / − / 0 acercan ----------
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (panel || e.altKey) return;
      const el = contenedor.current;
      if ((e.ctrlKey || e.metaKey) && el) {
        const cx = el.clientWidth / 2;
        const cy = el.clientHeight / 2;
        const z = zoomRef.current;
        if (e.key === '+' || e.key === '=' || e.key === '-') {
          ponerZoom(acercarEn(z, e.key === '-' ? z.z / 1.4 : z.z * 1.4, cx, cy), true);
          if (e.key !== '-' || z.z / 1.4 > 1.08) cambiarAjuste('libre');
          else cambiarAjuste('pagina');
        } else if (e.key === '0') {
          cambiarAjuste('pagina');
          reencuadrarRef.current('arriba', true);
        } else return;
        e.preventDefault();
        return;
      }
      const adelante = ['ArrowRight', 'PageDown', ' '].includes(e.key);
      const atras = ['ArrowLeft', 'PageUp'].includes(e.key);
      if (!adelante && !atras) return;
      e.preventDefault();
      sonido.despertar();
      pasador.current?.pasarSola(adelante ? 'adelante' : 'atras');
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, ponerZoom]);

  // Rueda: Ctrl + rueda acerca (y el navegador no hace su propio zoom); con zoom, la rueda desplaza.
  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      const r = el.getBoundingClientRect();
      const usado = gestos.current?.rueda(e, e.clientX - r.left, e.clientY - r.top);
      if (usado || e.ctrlKey) e.preventDefault();
    };
    // Safari (iPhone) tiene su propio pellizco: se desactiva para que mande el nuestro.
    const gesto = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', rueda, { passive: false });
    document.addEventListener('gesturestart', gesto);
    return () => {
      el.removeEventListener('wheel', rueda);
      document.removeEventListener('gesturestart', gesto);
    };
  }, [doc]);

  // El panel lateral cambia el espacio del libro: se vuelve a medir.
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [panelFrases]);

  // ---------- Toques ----------
  const enLector = (e: React.PointerEvent) => {
    const r = contenedor.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const bajar = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    sonido.despertar();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* algunos navegadores no dejan capturar: el gesto sigue igual */
    }
    const q = enLector(e);
    gestos.current?.bajar(q.x, q.y, e.pointerId);
  };
  const mover = (e: React.PointerEvent) => {
    const q = enLector(e);
    gestos.current?.mover(q.x, q.y, e.pointerId);
  };
  const subir = (e: React.PointerEvent) => {
    // En el celular el navegador solo deja encender el audio al levantar el dedo.
    sonido.despertar();
    const q = enLector(e);
    gestos.current?.subir(q.x, q.y, e.pointerId);
  };
  const cancelar = (e: React.PointerEvent) => gestos.current?.cancelar(e.pointerId);

  const total = doc?.numPages ?? 0;
  const noche = papel === 'noche';
  const mostrada = saltoA ?? pagina ?? 0;
  const pl = pliego(mostrada);
  const etiquetaPagina =
    disp?.modo === 'doble'
      ? pl.izquierda < 0
        ? `${miles(pl.derecha + 1)}`
        : pl.derecha >= total
          ? `${miles(pl.izquierda + 1)}`
          : `${miles(pl.izquierda + 1)}–${miles(pl.derecha + 1)}`
      : miles(mostrada + 1);
  const tituloBarra = [libro?.titulo, capitulo].filter(Boolean).join(' · ');
  const irASalto = () => {
    if (saltoA !== null) irA(saltoA);
    setSaltoA(null);
  };

  return (
    <div className={`lector ${enMesa ? 'en-mesa' : ''} ${disp?.modo === 'doble' ? 'en-doble' : ''} ${hayZoom ? 'con-zoom' : ''} papel-fondo-${papel}`}>
      <div
        ref={contenedor}
        className="lector-hoja"
        style={conPanel ? { right: PANEL } : undefined}
        onPointerDown={bajar}
        onPointerMove={mover}
        onPointerUp={subir}
        onPointerCancel={cancelar}
        onLostPointerCapture={cancelar}
        onContextMenu={(e) => e.preventDefault()}
      >
        {enMesa && disp && (
          <div ref={sombraLibro} className="sombra-hoja" style={{ width: disp.libro.w, height: disp.libro.h, transform: `translate(${disp.libro.x}px, ${disp.libro.y}px)` }} />
        )}
        <canvas ref={lienzo} className="lienzo-hoja" />
        {disp && (
          <canvas
            ref={lienzoPrevia}
            className={`lienzo-previa ${noche ? 'en-noche' : ''}`}
            style={{ width: disp.hoja.w, height: disp.hoja.h, transform: `translate(${disp.hoja.x}px, ${disp.hoja.y}px)` }}
          />
        )}
        {!error && (!doc || !dibujada) && <div className={`cargando ${noche || enMesa ? 'claro' : ''}`}>{doc ? 'Dibujando la página…' : 'Abriendo el libro…'}</div>}
      </div>

      {error && (
        <div className="lector-error">
          <p>{error}</p>
          <button className="btn-tinta" onClick={volver}>
            <Icono nombre="chevron-left" tam={16} /> Volver al estante
          </button>
        </div>
      )}

      <div className={`cromo-arriba ${cromo || enMesa ? 'visible' : ''} ${enMesa ? 'fijo' : ''}`} style={conPanel ? { right: PANEL } : undefined}>
        <button className="volver" onClick={volver}>
          <Icono nombre="chevron-left" tam={20} /> {desde === 'frases' ? 'Mis frases' : 'Estante'}
        </button>
        <div className="cromo-titulo">{enMesa ? tituloBarra : libro?.titulo}</div>
        {enMesa && anchoVentana >= 1100 && (
          <button
            className={`icono-barra ${panelFrases ? 'on' : ''}`}
            onClick={() => useAjustes.getState().poner({ panelFrases: !panelFrases })}
            aria-label={panelFrases ? 'Ocultar Mis frases' : 'Mostrar Mis frases'}
            title="Mis frases de este libro"
          >
            <Icono nombre="panel-right" tam={20} />
          </button>
        )}
      </div>

      <div className={`cromo-abajo ${cromo || enMesa ? 'visible' : ''} ${enMesa ? 'fijo' : ''}`} style={conPanel ? { right: PANEL } : undefined}>
        <span className="cromo-pag">{etiquetaPagina}</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          step={1}
          value={mostrada}
          aria-label="Ir a la página"
          style={{ '--v': `${total > 1 ? (mostrada / (total - 1)) * 100 : 0}%` } as React.CSSProperties}
          onChange={(e) => setSaltoA(Number(e.target.value))}
          onPointerUp={irASalto}
          onKeyUp={irASalto}
        />
        <span className="cromo-pag">de {miles(total)}</span>
      </div>

      {conPanel && libro && (
        <PanelFrases libroId={libro.id} alIr={irA} alCerrar={() => useAjustes.getState().poner({ panelFrases: false })} />
      )}

      <AvisoModo />
      <AvisoBreve mensaje={mensaje} alCerrar={cerrarMensaje} />
      {hayZoom && ajuste === 'libre' && !herramienta && (
        <button
          className="quitar-zoom"
          onClick={() => {
            // Con el zoom cortando el texto, este botón lo deja justo a todo el ancho.
            const v = vistaTam();
            const e = disp?.modo !== 'doble' ? encuadreDe(paginaRef.current) : null;
            cambiarAjuste(e && v && zoomAlTexto(e, v) > 1.03 ? 'texto' : 'pagina');
            reencuadrar(v ? { px: v.w / 2, py: v.h / 2 } : 'arriba', true);
          }}
        >
          {disp?.modo !== 'doble' ? 'Ajustar al texto' : 'Tamaño normal'}
        </button>
      )}

      {doc && (
        <MenuEsquina
          alPapel={() => setPanel(true)}
          alFrases={() => verFrases(libroId)}
          alAbrir={() => setCromo(false)}
          margenDerecho={conPanel ? PANEL : 0}
          margenAbajo={enMesa ? BARRA_ABAJO : 0}
        />
      )}

      {panel && <PapelYSonido libroId={libroId} alCerrar={() => setPanel(false)} />}
    </div>
  );
}
