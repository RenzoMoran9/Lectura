// Pantalla de lectura: la hoja en WebGL, el gesto de pasarla, el zoom, las marcas, el sonido y el
// recuerdo de la página. En el celular, una página a la vez; en pantallas anchas, el libro abierto
// a doble página sobre la mesa, con barras fijas y el panel de Mis frases.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { leerArchivo } from '../datos/archivos';
import { guardarAvance, guardarLibro, leerAvance, obtenerLibro, type Avance, type Libro } from '../datos/bd';
import { useAjustes } from '../estado/ajustes';
import { useFrases } from '../estado/frases';
import { useLibros } from '../estado/libros';
import { dibujarFrase, lienzoDeMarcas, recuadroEnCurso } from '../frases/dibujo';
import { Marcador, type Previa } from '../frases/marcador';
import type { Frase } from '../frases/modelo';
import { leerTextoPagina, letraEn, type TextoPagina } from '../frases/texto';
import {
  dibujarMarcaLectura,
  falta,
  tiempoLegible,
  marcaDesdeTexto,
  marcaSinTexto,
  sumarAlRitmo,
  tocaMarca,
  type MarcaLectura,
  type Ritmo,
} from '../lectura/lugar';
import type { Sentido } from '../hoja/geometria';
import { Gestos } from '../hoja/gestos';
import { densidad, disponer, esCelular, pliego, type Caja, type Disposicion } from '../hoja/maqueta';
import { MotorHoja, type Escena } from '../hoja/motor';
import { Pasador, type Pase } from '../hoja/pasador';
import { acercarEn, aLienzo, conZoom, desplazable, encuadrar, limitar, SIN_ZOOM, zoomAlTexto, type Encuadre, type Zoom } from '../hoja/zoom';
import { capituloDe, leerCapitulos, type Capitulo } from '../pdf/indice';
import { armarIndiceDoc } from '../pdf/indiceArmado';
import { aOriginal, clave as claveMedida, HojasMedida, lineasEnHoja, parteDe } from '../lectura/medida';
import type { TipoTrazo } from '../sonido/sonido';
import { coincidencias } from '../lectura/buscar';
import { luzActual } from '../lectura/luz';
import { hayVoz, LecturaEnVoz, Narrador, nombresVoces, oracionDesdeAltura, oracionEn, vocesEnEspanol, type EstadoVoz, type Locutor } from '../lectura/voz';
import { LocutorPropio, motorVoces, VOCES_PROPIAS, vozPropia } from '../lectura/vozPropia';
import { abrirPdf, bytesLeidos, cerrarPdf, type DocumentoPdf } from '../pdf/pdf';
import { Paginas } from '../pdf/paginas';
import { ambiente } from '../sonido/ambiente';
import { sonido } from '../sonido/sonido';
import { AvisoBreve, AvisoModo, type Mensaje } from './Avisos';
import { CompartirFrase } from './CompartirFrase';
import { VistaPagina } from './VistaPagina';
import { Icono } from './Icono';
import { BuscarLibro, type Resultado } from './BuscarLibro';
import { Indice } from './Indice';
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
/** Un rectángulo de una página, en fracciones de la página (0..1, desde arriba a la izquierda). */
type Rango = { x0: number; y0: number; x1: number; y1: number };
const BARRA_ARRIBA = 52;
const BARRA_ABAJO = 56;
/** Velocidades de la lectura en voz alta (se cambian tocando «1×»). */
const VELOCIDADES = [0.8, 1, 1.2, 1.5];

export function Lector({ libroId, paginaPedida, desde }: { libroId: string; paginaPedida?: number; desde?: 'inicio' | 'frases' }) {
  const volver = useLibros((s) => s.volver);
  const verFrases = useLibros((s) => s.verFrases);
  const anotarAvance = useLibros((s) => s.anotarAvance);
  const papel = useAjustes((s) => s.papel);
  const panelFrases = useAjustes((s) => s.panelFrases);
  const herramienta = useFrases((s) => s.herramienta);
  const vistaMedidaElegida = useAjustes((s) => s.vistaMedida);
  const letraMedida = useAjustes((s) => s.letraMedida);

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
  const [compartirDe, setCompartirDe] = useState<Frase | null>(null);
  const [vistaAbierta, setVistaAbierta] = useState(false);
  /** El recuadro que espera «Guardar» o «Compartir»: dónde está en la pantalla (para no taparlo). */
  const [recuadro, setRecuadro] = useState<{ arriba: number; abajo: number } | null>(null);
  const [hayZoom, setHayZoom] = useState(false);
  const [capitulos, setCapitulos] = useState<Capitulo[]>([]);
  /** De dónde sale el índice: del PDF, armado por la app (o armándose), o no hay. */
  const [origenIndice, setOrigenIndice] = useState<{ tipo: 'pdf' | 'armado' | 'armando' | 'ninguno'; avance?: number }>({ tipo: 'pdf' });
  const [ajuste, setAjuste] = useState<Ajuste>(() => (useAjustes.getState().ajusteTexto ? 'texto' : 'pagina'));
  /** Fui a otra parte del libro (una frase, el índice, la barra): aquí iba, para volver. */
  const [regreso, setRegreso] = useState<{ pagina: number; cy?: number; parte?: number } | null>(null);
  const [indiceAbierto, setIndiceAbierto] = useState(false);
  const [pasando, setPasando] = useState(false);
  const [destellos, setDestellos] = useState<{ rects: { x: number; y: number; w: number; h: number }[]; clave: number } | null>(null);
  const [buscarAbierto, setBuscarAbierto] = useState(false);
  /** Lectura en voz alta: qué oración se lee y en qué página (null: no se está leyendo). */
  const [voz, setVoz] = useState<EstadoVoz | null>(null);
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  const vozGuardada = useAjustes((s) => s.voz);
  const [estadoVoces, setEstadoVoces] = useState(motorVoces.estado);
  const [vocesBajadas, setVocesBajadas] = useState(true);
  const velocidadVoz = useAjustes((s) => s.velocidadVoz);
  const boton = useAjustes((s) => s.boton);
  const luzAuto = useAjustes((s) => s.luzAuto);
  const brillo = useAjustes((s) => s.brillo);
  const tibieza = useAjustes((s) => s.tibieza);
  const [reloj, setReloj] = useState(() => Date.now());
  const [ritmo, setRitmo] = useState<Ritmo | undefined>(undefined);
  const marcaLectura = useLibros((s) => s.libros.find((l) => l.id === libroId)?.marcador);
  const cerrarMensaje = useCallback(() => setMensaje(null), []);

  const motor = useRef<MotorHoja | null>(null);
  const paginas = useRef<Paginas | null>(null);
  const pasador = useRef<Pasador | null>(null);
  const marcador = useRef<Marcador | null>(null);
  const gestos = useRef<Gestos | null>(null);
  const paginaRef = useRef(0);
  /** «A tu medida»: en qué hoja de la página voy, si la vista está así ahora y quién prepara las hojas. */
  const parteRef = useRef(0);
  const [parte, setParte] = useState(0);
  const enMedidaRef = useRef(false);
  const [enMedida, setEnMedida] = useState(false);
  const medida = useRef<HojasMedida | null>(null);
  /** Al volver a abrir el libro: en qué hoja iba (cuando la página esté acomodada). */
  const partePendiente = useRef<{ pagina: number; parte?: number; rect?: { x0: number; y0: number; x1: number; y1: number } } | null>(null);
  const dispRef = useRef<Disposicion | null>(null);
  const zoomRef = useRef<Zoom>(SIN_ZOOM);
  const regresoRef = useRef<{ pagina: number; cy?: number; parte?: number } | null>(null);
  const pasesDesdeSalto = useRef(0);
  /** Altura de la página (0..1) a la que hay que llevar la vista cuando la página esté lista. */
  const cyPendiente = useRef<number | null>(null);
  /** Algo que debe brillar al llegar a su página: la línea del marcador o la palabra buscada. */
  const destelloPendiente = useRef<{ pagina: number; rects: Rango[]; mensaje?: string } | null>(null);
  const ritmoRef = useRef<Ritmo | undefined>(undefined);
  const inicioPagina = useRef(performance.now());
  const capitulosRef = useRef<Capitulo[]>([]);
  const listoRef = useRef(false);
  const marcadorRef = useRef<MarcaLectura | undefined>(marcaLectura);
  marcadorRef.current = marcaLectura;
  const cintaRef = useRef<HTMLDivElement>(null);
  const ajusteRef = useRef<Ajuste>(ajuste);
  /** La página aún no estaba medida al encuadrarla: se encuadra de nuevo cuando llegue. */
  const encuadrePendiente = useRef<'arriba' | 'abajo' | null>(null);
  const animZoom = useRef(0);
  const detalleQuieto = useRef(0);
  const textos = useRef(new Map<number, TextoPagina | 'leyendo'>());
  const borradasGesto = useRef<Frase[]>([]);
  /** Página en la que se está marcando (en doble página puede ser la izquierda o la derecha). */
  const marcaPagina = useRef<{ indice: number; rect: Caja } | null>(null);
  const lecturaVoz = useRef<LecturaEnVoz | null>(null);
  const vozRef = useRef<EstadoVoz | null>(null);
  const vocesRef = useRef<SpeechSynthesisVoice[]>([]);
  const capaVoz = useRef<HTMLDivElement>(null);
  /** Cuenta como actividad (la pantalla no se apaga): tocar, o que la voz siga leyendo. */
  const actividadRef = useRef(() => {});

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
      ritmoRef.current = av?.ritmo;
      setRitmo(av?.ritmo);
      const m = l.marcador;
      if (av && paginaPedida != null && paginaPedida !== av.pagina) {
        // Vine a ver una frase: donde iba queda guardado para volver.
        regresoRef.current = { pagina: av.pagina, cy: av.cy };
        setRegreso(regresoRef.current);
      } else if (m && m.pagina === inicial) {
        cyPendiente.current = (m.y0 + m.y1) / 2;
        destelloPendiente.current = { pagina: m.pagina, rects: [m], mensaje: 'Aquí te quedaste' };
      } else if (av?.cy != null && inicial === av.pagina) cyPendiente.current = av.cy;
      if (av?.parte != null && inicial === av.pagina && paginaPedida == null) partePendiente.current = { pagina: inicial, parte: av.parte };
      listoRef.current = true;
      setLibro(l);
      setDoc(d);
      setPagina(inicial);
      void leerCapitulos(d).then((c) => {
        if (!vivo) return;
        const poner = (lista: Capitulo[], tipo: 'pdf' | 'armado' | 'ninguno') => {
          capitulosRef.current = lista;
          setCapitulos(lista);
          setOrigenIndice({ tipo });
        };
        if (c.length) return poner(c, 'pdf');
        if (l.indiceArmado) return poner(l.indiceArmado, l.indiceArmado.length ? 'armado' : 'ninguno');
        // El PDF no trae índice: se arma una vez, en segundo plano, buscando los títulos en el
        // texto. Con otra copia del documento, para no llenar la memoria del que se está leyendo.
        setOrigenIndice({ tipo: 'armando', avance: 0 });
        window.setTimeout(async () => {
          if (!vivo) return;
          const otro = await abrirPdf(archivo).catch(() => null);
          if (!otro) return vivo && setOrigenIndice({ tipo: 'ninguno' });
          try {
            const lista = await armarIndiceDoc(otro, { alAvanzar: (f) => vivo && setOrigenIndice({ tipo: 'armando', avance: f }), seguir: () => vivo });
            if (!lista) return;
            const actual = await obtenerLibro(l.id);
            if (actual) await guardarLibro({ ...actual, indiceArmado: lista });
            if (vivo) poner(lista, lista.length ? 'armado' : 'ninguno');
          } catch {
            if (vivo) setOrigenIndice({ tipo: 'ninguno' });
          } finally {
            cerrarPdf(otro);
          }
        }, 2500);
      });
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
      medida.current?.cambiarDocumento(nuevo);
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
  /** «A tu medida»: la hoja que se ve y sus vecinas (con su número para el motor), o null. */
  const hojaActual = () => claveMedida(paginaRef.current, parteRef.current);
  const hojaSiguiente = (): number | null => {
    const p = paginaRef.current;
    const n = medida.current?.partes(p);
    if (n != null && parteRef.current + 1 < n) return claveMedida(p, parteRef.current + 1);
    return p + 1 < totalRef.current ? claveMedida(p + 1, 0) : null;
  };
  const hojaAnterior = (): number | null => {
    const p = paginaRef.current;
    if (parteRef.current > 0) return claveMedida(p, parteRef.current - 1);
    const n = p > 0 ? medida.current?.partes(p - 1) : undefined;
    return n != null ? claveMedida(p - 1, n - 1) : null;
  };

  const escenaQuieta = useCallback((): Escena => {
    const p = paginaRef.current;
    const n = totalRef.current;
    if (enMedidaRef.current) return { hoja: hojaActual(), debajo: null, doblez: null, sombra: 0 };
    if (esDoble()) {
      const { izquierda, derecha } = pliego(p);
      return { hoja: derecha < n ? derecha : null, izquierda: izquierda >= 0 ? izquierda : null, debajo: null, doblez: null, sombra: 0 };
    }
    return { hoja: p, debajo: null, doblez: null, sombra: 0 };
  }, []);

  /**
   * ¿Se lee «a tu medida»? Si lo elegí, en el celular de pie y sin una herramienta en la mano (para
   * resaltar o encerrar se vuelve un momento a la página original). De lado, la página original.
   */
  const actualizarMedida = () => {
    const d = dispRef.current;
    const v = vistaTam();
    const quiere = useAjustes.getState().vistaMedida && d?.modo === 'celular' && !!v && v.h > v.w && !useFrases.getState().herramienta;
    if (quiere === enMedidaRef.current) return;
    enMedidaRef.current = quiere;
    setEnMedida(quiere);
    if (quiere) {
      quitarZoom();
      motor.current?.quitarDetalles();
    }
    motor.current?.poner(escenaQuieta());
    pedirPaginasRef.current();
    requestAnimationFrame(() => {
      ubicarCintaRef.current();
      ubicarVozRef.current();
    });
  };
  const actualizarMedidaRef = useRef(actualizarMedida);
  actualizarMedidaRef.current = actualizarMedida;

  /** «A tu medida»: muestra otra hoja de la misma página (sin pasarla con el dedo). */
  const irAParte = (j: number) => {
    parteRef.current = j;
    setParte(j);
    motor.current?.poner(escenaQuieta());
    pedirPaginasRef.current();
  };
  const irAParteRef = useRef(irAParte);
  irAParteRef.current = irAParte;

  const visibles = () => {
    const p = paginaRef.current;
    if (!esDoble()) return [p];
    const { izquierda, derecha } = pliego(p);
    return [izquierda, derecha].filter((i) => i >= 0 && i < totalRef.current);
  };

  // ---------- Zoom ----------
  // El tamaño del lector se mide al acomodar la hoja (así no se lee del DOM en cada cuadro).
  const vistaMedida = useRef<{ w: number; h: number } | null>(null);

  const vistaTam = () => {
    if (vistaMedida.current) return vistaMedida.current;
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
    ubicarCintaRef.current();
    ubicarVozRef.current();
    // La altura a la que voy en la página: se recuerda al salir, aunque la hoja siga deslizándose.
    const cy = vistaCyRef.current();
    if (cy !== undefined) cyRef.current = cy;
    setHayZoom(conZoom(z));
  }, []);

  /**
   * Las páginas se dibujan a la medida de la pantalla; con zoom (o de lado) hace falta más detalle.
   * Se usa la densidad real de la pantalla (hasta 3): con 2,5 los celulares de pantalla muy fina
   * veían el texto estirado (algo borroso) con poco zoom.
   */
  const densidadPantalla = () => Math.min(window.devicePixelRatio || 1, 3);
  const necesitaDetalle = (z: Zoom) => {
    if (enMedidaRef.current) return false;
    const tam = paginas.current?.lienzoTam;
    return !!tam && tam.dpr < densidadPantalla() * z.z * 0.97;
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
    const k = densidadPantalla() * z.z;
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
      // «A tu medida» no tiene zoom: la letra se agranda con «Aa».
      if (!d || !el || enMedidaRef.current) return;
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
        else vistaQuietaRef.current();
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

  // ---------- Dónde voy: la altura en la página, el marcador y «volver a donde iba» ----------
  /** Borde izquierdo de la hoja de una página en el lienzo (en doble página, la izquierda va antes del lomo). */
  const origenPagina = (i: number) => {
    const d = dispRef.current!;
    return d.modo === 'doble' && i === pliego(paginaRef.current).izquierda ? d.hoja.x - d.hoja.w : d.hoja.x;
  };

  /** Con la vista movible: a qué altura de la página está el centro de la pantalla (0..1). */
  const vistaCy = (): number | undefined => {
    const d = dispRef.current;
    const v = vistaTam();
    if (!d || !v || !sePuedeMover()) return undefined;
    const r = paginas.current?.rectPagina(paginaRef.current) ?? d.caja;
    const y = aLienzo(zoomRef.current, v.w / 2, v.h / 2).y;
    return Math.max(0, Math.min(1, (y - d.hoja.y - r.y) / r.h));
  };
  const cyRef = useRef<number | undefined>(undefined);
  const vistaCyRef = useRef(vistaCy);
  vistaCyRef.current = vistaCy;

  /** Lleva la vista a la altura guardada, cuando la página ya está medida. */
  const aplicarCyPendiente = () => {
    const cy = cyPendiente.current;
    const d = dispRef.current;
    const v = vistaTam();
    const r = paginas.current?.rectPagina(paginaRef.current);
    if (cy == null || !d || !v || !r) return false;
    cyPendiente.current = null;
    encuadrePendiente.current = null;
    const z = objetivo('arriba');
    if (!z) return false;
    ponerZoom({ ...z, y: v.h / 2 - z.z * (d.hoja.y + r.y + cy * r.h) });
    cyRef.current = cy;
    programarDetalle();
    return true;
  };

  /**
   * «A tu medida»: dónde quedan en la pantalla los trozos de una línea de la página original (en la
   * hoja que se ve). Las palabras vecinas en un mismo renglón nuevo se juntan en un solo trozo.
   */
  const rectsMedida = (m: Rango & { pagina: number }) => {
    const d = dispRef.current;
    const dis = medida.current?.disposicion(m.pagina);
    const hoja = dis?.hojas[parteRef.current];
    if (!d || !dis || !hoja || m.pagina !== paginaRef.current) return [];
    const juntos = lineasEnHoja(hoja, { x0: m.x0 * dis.ancho, y0: m.y0 * dis.alto, x1: m.x1 * dis.ancho, y1: m.y1 * dis.alto });
    const z = zoomRef.current;
    return juntos.map((r) => ({ x: z.x + z.z * (d.hoja.x + r.x), y: z.y + z.z * (d.hoja.y + r.y), w: z.z * r.w, h: z.z * r.h, borde: z.x + z.z * d.hoja.x }));
  };
  /** Los rectángulos en la pantalla de una línea (varios en «A tu medida», si se partió). */
  const rectsMarcaPantalla = (m: Rango & { pagina: number }) => {
    if (enMedidaRef.current) return rectsMedida(m);
    const r = rectMarcaPantalla(m);
    return r ? [r] : [];
  };

  /** Rectángulo en la pantalla de la línea marcada (si su página está a la vista). */
  const rectMarcaPantalla = (m: Rango & { pagina: number }) => {
    if (enMedidaRef.current) {
      // El primer trozo: ahí va la cinta, y hacia ahí sigue la vista.
      return rectsMedida(m)[0] ?? null;
    }
    const d = dispRef.current;
    const r = paginas.current?.rectPagina(m.pagina);
    if (!d || !r || !visibles().includes(m.pagina)) return null;
    const z = zoomRef.current;
    const x = origenPagina(m.pagina) + r.x + m.x0 * r.w;
    const y = d.hoja.y + r.y + m.y0 * r.h;
    return { x: z.x + z.z * x, y: z.y + z.z * y, w: z.z * (m.x1 - m.x0) * r.w, h: z.z * (m.y1 - m.y0) * r.h, borde: z.x + z.z * origenPagina(m.pagina) };
  };

  /** La cinta roja del marcador, en el borde de la hoja a la altura de la línea. */
  const ubicarCinta = () => {
    const el = cintaRef.current;
    if (!el) return;
    const m = marcadorRef.current;
    const rs = m ? rectMarcaPantalla(m) : null;
    if (!rs) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.style.transform = `translate(${Math.max(0, rs.borde)}px, ${rs.y + rs.h / 2 - 14}px)`;
  };
  const ubicarCintaRef = useRef(ubicarCinta);
  ubicarCintaRef.current = ubicarCinta;

  /** La oración que se lee en voz alta, iluminada sobre la página (sigue al zoom). */
  const ubicarVoz = () => {
    const capa = capaVoz.current;
    if (!capa) return;
    const e = vozRef.current;
    const hijos = capa.children as HTMLCollectionOf<HTMLElement>;
    const rects = e ? e.rangos.flatMap((rango) => rectsMarcaPantalla({ pagina: e.pagina, ...rango })) : [];
    for (let k = 0; k < hijos.length; k++) {
      const r = rects[k];
      const h = hijos[k];
      if (!r) {
        h.style.display = 'none';
        continue;
      }
      h.style.display = '';
      h.style.transform = `translate(${r.x - 3}px, ${r.y - 2}px)`;
      h.style.width = `${r.w + 6}px`;
      h.style.height = `${r.h + 4}px`;
    }
  };
  const ubicarVozRef = useRef(ubicarVoz);
  ubicarVozRef.current = ubicarVoz;

  /** Al llegar a la página del marcador (o de lo buscado), esa línea brilla un momento. */
  const mostrarDestello = () => {
    const p = destelloPendiente.current;
    if (!p || !visibles().includes(p.pagina)) return;
    if (enMedidaRef.current) {
      // Primero, la hoja de la página donde está (la línea del marcador, lo buscado…).
      const dis = medida.current?.disposicion(p.pagina);
      if (!dis) return;
      const r = p.rects[0];
      const j = r ? parteDe(dis, { x0: r.x0 * dis.ancho, y0: r.y0 * dis.alto, x1: r.x1 * dis.ancho, y1: r.y1 * dis.alto }) : -1;
      if (j >= 0 && j !== parteRef.current) {
        irAParteRef.current(j);
        return;
      }
      if (!medida.current?.obtener(hojaActual())) return;
    } else if (!paginas.current?.obtener(p.pagina)) return;
    destelloPendiente.current = null;
    window.setTimeout(() => {
      const rects = p.rects.flatMap((r) => rectsMarcaPantalla({ pagina: p.pagina, ...r }));
      if (rects.length) setDestellos({ rects, clave: Date.now() });
      if (p.mensaje) setMensaje({ texto: p.mensaje, clave: Date.now() });
    }, 350);
  };

  const ponerRegreso = (r: { pagina: number; cy?: number; parte?: number } | null) => {
    regresoRef.current = r;
    pasesDesdeSalto.current = 0;
    setRegreso(r);
  };

  /** La vista se quedó quieta: detalle nítido y, un momento después, se recuerda la altura. */
  const guardado = useRef(0);
  const vistaQuieta = () => {
    programarDetalle();
    cyRef.current = vistaCy();
    clearTimeout(guardado.current);
    guardado.current = window.setTimeout(() => anotarRef.current(), 800);
  };
  const vistaQuietaRef = useRef(vistaQuieta);
  vistaQuietaRef.current = vistaQuieta;
  const anotarRef = useRef(() => {});

  /**
   * El dedo quieto medio segundo sobre una línea: ahí queda el marcador (una cinta en el borde y
   * una raya de lápiz rojo desde la palabra). Sobre el marcador que ya estaba, lo quita.
   */
  const ponerMarcador = async (x: number, y: number) => {
    const d = dispRef.current;
    const pags = paginas.current;
    const doc = docActual.current;
    if (!d || !pags || !doc || useFrases.getState().herramienta) return;
    const c = aLienzo(zoomRef.current, x, y);
    let i = paginaRef.current;
    let u: number;
    let v: number;
    let ub: { ancho: number; alto: number } | undefined;
    if (enMedidaRef.current) {
      // La palabra tocada en la hoja, en su lugar de la página original.
      const dis = medida.current?.disposicion(i);
      const hoja = dis?.hojas[parteRef.current];
      const o = hoja && aOriginal(hoja, c.x - d.hoja.x, c.y - d.hoja.y);
      if (!dis || !o) return;
      ub = { ancho: dis.ancho, alto: dis.alto };
      u = o.u / dis.ancho;
      v = o.v / dis.alto;
    } else {
      if (d.modo === 'doble') {
        const { izquierda, derecha } = pliego(paginaRef.current);
        i = c.x < d.hoja.x ? izquierda : derecha;
      }
      if (i < 0 || i >= totalRef.current) return;
      const r = pags.rectPagina(i);
      ub = pags.ubicacion(i);
      if (!r || !ub) return;
      u = (c.x - origenPagina(i) - r.x) / r.w;
      v = (c.y - d.hoja.y - r.y) / r.h;
    }
    if (u < -0.05 || u > 1.05 || v < 0 || v > 1) return;
    navigator.vibrate?.(12);
    const { actualizar } = useLibros.getState();
    const actual = marcadorRef.current;
    if (actual && actual.pagina === i && tocaMarca(actual, u, v)) {
      await actualizar(libroId, { marcador: undefined });
      setMensaje({ texto: 'Marcador quitado', clave: Date.now() });
      return;
    }
    const guardado = textos.current.get(i);
    let t: TextoPagina | undefined = guardado && guardado !== 'leyendo' ? guardado : undefined;
    if (!t) {
      try {
        t = await leerTextoPagina(await doc.getPage(i + 1));
        textos.current.set(i, t);
      } catch {
        t = undefined;
      }
    }
    let m: MarcaLectura | null = null;
    if (t?.tieneTexto) {
      const k = letraEn(t, u * ub.ancho, v * ub.alto, 14);
      if (k >= 0) m = marcaDesdeTexto(t, k, ub.ancho, ub.alto, i);
    }
    m ??= marcaSinTexto(Math.max(0, u), v, pags.contenido(i)?.x1 ?? 0.92, i);
    await actualizar(libroId, { marcador: m });
    // Marcar aquí es decir «voy por aquí»: si había ido a ver otra parte, ahora este es mi lugar.
    if (regresoRef.current) ponerRegreso(null);
    anotarRef.current();
    setMensaje({ texto: 'Marcador puesto · aquí te quedaste', clave: Date.now() });
  };
  const ponerMarcadorRef = useRef(ponerMarcador);
  ponerMarcadorRef.current = ponerMarcador;
  const aplicarCyPendienteRef = useRef(aplicarCyPendiente);
  aplicarCyPendienteRef.current = aplicarCyPendiente;
  const mostrarDestelloRef = useRef(mostrarDestello);
  mostrarDestelloRef.current = mostrarDestello;
  const ponerRegresoRef = useRef(ponerRegreso);
  ponerRegresoRef.current = ponerRegreso;

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

    // «A tu medida»: las hojas del celular, con sus marcas dibujadas sobre las palabras.
    const marcasDePagina = (i: number) => {
      const marca = useLibros.getState().libros.find((l) => l.id === libro.id)?.marcador;
      return {
        frases: useFrases.getState().frases.filter((f) => f.libroId === libro.id && f.pagina === i),
        marcador: marca?.pagina === i ? marca : null,
      };
    };
    const med = new HojasMedida(docActual.current ?? doc, { ancho: 1, alto: 1, dpr: 1, letra: 20, titulo: libro.titulo }, marcasDePagina);
    medida.current = med;
    med.onLista = (k, c) => {
      m.subirPagina(k, c);
      if (!enMedidaRef.current || k !== hojaActual()) return;
      setDibujada(true);
      mostrarDestelloRef.current();
      ubicarCintaRef.current();
      ubicarVozRef.current();
    };
    med.onSoltada = (k) => m.soltarPagina(k);
    med.onDisposicion = (pagina, d) => {
      if (!enMedidaRef.current || pagina !== paginaRef.current) return;
      // Al volver a abrir el libro: la hoja donde iba. Y nunca más allá de las que tiene la página.
      const pendiente = partePendiente.current;
      let j = parteRef.current;
      if (pendiente?.pagina === pagina) {
        partePendiente.current = null;
        if (pendiente.rect) j = Math.max(0, parteDe(d, pendiente.rect));
        else if (pendiente.parte != null) j = pendiente.parte;
      }
      j = Math.max(0, Math.min(d.hojas.length - 1, j));
      if (j !== parteRef.current) {
        parteRef.current = j;
        setParte(j);
        m.poner(escenaQuieta());
      }
      pedirPaginasRef.current();
      mostrarDestelloRef.current();
    };

    // Marcas de cada página: un lienzo blanco con sus frases, que el shader multiplica con la página.
    const lienzosMarcas = new Map<number, HTMLCanvasElement>();
    const pintarMarcas = (i: number) => {
      const ub = pags.ubicacion(i);
      const tam = pags.lienzoTam;
      if (!ub || !tam) return;
      const fs = useFrases.getState().frases.filter((f) => f.libroId === libro.id && f.pagina === i);
      const marca = useLibros.getState().libros.find((l) => l.id === libro.id)?.marcador;
      const conMarca = marca?.pagina === i ? marca : null;
      if (!fs.length && !conMarca) {
        lienzosMarcas.delete(i);
        m.subirMarcas(i, null);
        return;
      }
      const c = lienzoDeMarcas(tam.ancho, tam.alto, fs, { x: ub.x, y: ub.y, escala: ub.escala, dpr: tam.dpr }, lienzosMarcas.get(i));
      // La raya de lápiz del marcador va en la página: se curva con ella al pasarla.
      if (conMarca) {
        const k = tam.dpr;
        dibujarMarcaLectura(c.getContext('2d')!, conMarca, ub.x * k, ub.y * k, ub.ancho * ub.escala * k, ub.alto * ub.escala * k, k);
      }
      lienzosMarcas.set(i, c);
      m.subirMarcas(i, c);
    };
    const dejarDeEscuchar = useFrases.subscribe((ahora, antes) => {
      if (ahora.frases === antes.frases) return;
      pags.indices().forEach(pintarMarcas);
      // En «A tu medida», las hojas de las páginas cercanas se vuelven a dibujar con sus marcas.
      const p = paginaRef.current;
      if (enMedidaRef.current) [p, p - 1, p + 1].forEach((i) => med.marcasCambiaron(i));
    });
    const marcaDe = (st: { libros: Libro[] }) => st.libros.find((l) => l.id === libro.id)?.marcador;
    const dejarDeEscucharMarca = useLibros.subscribe((ahora, antes) => {
      const a = marcaDe(ahora);
      const b = marcaDe(antes);
      if (a === b) return;
      for (const i of new Set([a?.pagina, b?.pagina])) if (i != null && pags.obtener(i)) pintarMarcas(i);
      for (const i of new Set([a?.pagina, b?.pagina])) if (i != null) med.marcasCambiaron(i);
      requestAnimationFrame(() => ubicarCintaRef.current());
    });

    pags.onLista = (i, c) => {
      m.subirPagina(i, c);
      pintarMarcas(i);
      if (visibles().includes(i)) {
        setDibujada(visibles().every((j) => !!pags.obtener(j)));
        const pendiente = encuadrePendiente.current;
        const ocupado = gestos.current?.ocupado || p.ocupado;
        if (i === paginaRef.current && cyPendiente.current != null && !ocupado) aplicarCyPendienteRef.current();
        else if (i === paginaRef.current && pendiente && !ocupado) reencuadrarRef.current(pendiente, true);
        else if (necesitaDetalle(zoomRef.current)) programarDetalle();
        if (i === paginaRef.current) mostrarDestelloRef.current();
        ubicarCintaRef.current();
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
        if (enMedidaRef.current) return (s === 'adelante' ? hojaSiguiente() : hojaAnterior()) != null;
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
        if (enMedidaRef.current) {
          m.poner(
            pase.sentido === 'adelante'
              ? { hoja: hojaActual(), debajo: hojaSiguiente(), doblez, sombra }
              : { hoja: hojaAnterior(), debajo: hojaActual(), doblez, sombra },
          );
          return;
        }
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
        setPasando(false);
        if (paso) {
          // El ritmo: cuánto tardé en leer la página que acabo de pasar.
          const ahora = performance.now();
          // (Mientras la voz lee, no: ese no es mi ritmo de lectura.)
          // En «A tu medida» una página son varias hojas: lo de una hoja, por las hojas de la página.
          const hojas = enMedidaRef.current ? (medida.current?.partes(paginaRef.current) ?? 1) : 1;
          if (s === 'adelante' && !lecturaVoz.current?.activa) {
            ritmoRef.current = sumarAlRitmo(ritmoRef.current, ((ahora - inicioPagina.current) / 1000 / (esDoble() ? 2 : 1)) * hojas);
            setRitmo(ritmoRef.current);
          }
          inicioPagina.current = ahora;
          // Si había ido a ver otra parte y sigo leyendo desde ahí, ese pasa a ser mi lugar.
          if (regresoRef.current && ++pasesDesdeSalto.current >= 2) ponerRegresoRef.current(null);
          const antes = paginaRef.current;
          if (enMedidaRef.current) {
            // La hoja siguiente (o anterior): de la misma página o de la vecina.
            if (s === 'adelante') {
              if (parteRef.current + 1 < hojas) parteRef.current++;
              else [paginaRef.current, parteRef.current] = [antes + 1, 0];
            } else if (parteRef.current > 0) parteRef.current--;
            else [paginaRef.current, parteRef.current] = [antes - 1, (medida.current?.partes(antes - 1) ?? 1) - 1];
            setParte(parteRef.current);
          } else if (esDoble()) {
            const { izquierda, derecha } = pliego(paginaRef.current);
            paginaRef.current = s === 'adelante' ? derecha + 1 : Math.max(0, izquierda - 2);
          } else {
            paginaRef.current += s === 'adelante' ? 1 : -1;
            parteRef.current = 0;
          }
          if (paginaRef.current !== antes) setPagina(paginaRef.current);
          else pedirPaginas();
          void revisarMemoria();
        }
        quieta();
        // Con zoom o de lado, la página nueva se empieza a leer desde arriba (o desde abajo, al volver).
        if (paso && sePuedeMover()) reencuadrarRef.current(s === 'adelante' ? 'arriba' : 'abajo', true);
      },
      alEmpezar: () => {
        setCromo(false);
        setPasando(true);
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
        const h = useFrases.getState().herramienta;
        return h === 'lapiz' || h === 'recuadro' ? a.colorLapiz : a.colorResaltador;
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
      guardar: (f, donde, opciones) => {
        const nueva = { ...f, libroTitulo: libro.titulo };
        void useFrases.getState().agregar(nueva);
        if (opciones?.compartir) setCompartirDe(nueva);
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
      alPendiente: (pend) => {
        if (!pend) return setRecuadro(null);
        const r = contenedor.current?.getBoundingClientRect();
        const rect = marcaPagina.current?.rect ?? dispRef.current?.hoja;
        const z = zoomRef.current;
        const y = (v: number) => (r?.top ?? 0) + z.y + z.z * ((rect?.y ?? 0) + v);
        setRecuadro({ arriba: y(pend.caja.y), abajo: y(pend.caja.y + pend.caja.h) });
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

    // Sonido al marcar: lápiz, resaltador o goma, según la velocidad del dedo.
    let ultimoTrazo = { x: 0, y: 0, t: 0 };
    const trazoDe = (): TipoTrazo | null => {
      const h = useFrases.getState().herramienta;
      return h === 'lapiz' ? 'lapiz' : h === 'resaltador' ? 'resaltador' : h === 'borrador' ? 'borrador' : null;
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
          const tipo = trazoDe();
          if (tipo) sonido.empezarTrazo(tipo);
          ultimoTrazo = { x, y, t: performance.now() };
        },
        mover: (x, y, id) => {
          const c = aLienzo(zoomRef.current, x, y);
          const r = marcaPagina.current?.rect;
          if (r) mk.mover(c.x - r.x, c.y - r.y, id);
          const t = performance.now();
          sonido.moverTrazo(Math.hypot(x - ultimoTrazo.x, y - ultimoTrazo.y) / Math.max(1, t - ultimoTrazo.t));
          ultimoTrazo = { x, y, t };
        },
        subir: (_x, _y, id) => {
          sonido.pararTrazo();
          mk.subir(id);
        },
        cancelar: () => {
          sonido.pararTrazo();
          mk.cancelar();
        },
      },
      tocar: () => {
        const d = dispRef.current;
        if (!useFrases.getState().herramienta && d?.modo === 'celular') setCromo((c) => !c);
      },
      dobleToque: (x, y) => {
        if (useFrases.getState().herramienta || enMedidaRef.current) return;
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
      finZoom: () => vistaQuietaRef.current(),
      mantener: (x, y) => void ponerMarcadorRef.current(x, y),
    });

    quieta();

    return () => {
      dejarDeEscuchar();
      dejarDeEscucharMarca();
      sonido.pararTrazo();
      gestos.current?.destruir();
      gestos.current = null;
      marcador.current = null;
      p.destruir();
      pags.destruir();
      med.destruir();
      m.destruir();
      motor.current = null;
      paginas.current = null;
      medida.current = null;
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
      const cyAntes = cyRef.current;
      vistaMedida.current = { w, h };
      setAnchoVentana(window.innerWidth);
      const ancha = !esCelular(w, h);
      const d = disponer(w, h, margenesSeguros(), aspecto, ancha ? { barraArriba: BARRA_ARRIBA, barraAbajo: BARRA_ABAJO } : {});
      // Las páginas se dibujan a la medida de la hoja (de lado es más alta que la pantalla: menos
      // densidad, y el detalle nítido se agrega encima); el lienzo, siempre a la de la pantalla.
      const dpr = densidad(window.devicePixelRatio, d.hoja.w, d.hoja.h);
      // El lienzo de la pantalla, con toda su densidad también en los celulares grandes.
      const dprLienzo = densidad(window.devicePixelRatio, w, h, 4.4e6);
      const cambioModo = dispRef.current?.modo !== d.modo;
      dispRef.current = d;
      setDisp(d);
      pasador.current?.cancelar();
      marcador.current?.cancelar();
      requestAnimationFrame(() => requestAnimationFrame(() => marcador.current?.redibujar()));
      quitarZoom();
      motor.current?.medir(w, h, dprLienzo, d.hoja, { recortarLomo: d.modo === 'mesa', doble: d.modo === 'doble' });
      paginas.current?.configurar({ ancho: d.hoja.w, alto: d.hoja.h, dpr, caja: d.caja, titulo: libro.titulo });
      medida.current?.configurar({ ancho: d.hoja.w, alto: d.hoja.h, dpr, letra: useAjustes.getState().letraMedida, titulo: libro.titulo });
      actualizarMedidaRef.current();
      if (cambioModo) {
        motor.current?.poner(escenaQuieta());
        pedirPaginas();
      }
      // Al girar el celular se conserva el ajuste (el texto a todo el ancho sigue así).
      if (ajusteRef.current === 'libre') cambiarAjuste('pagina');
      // Al girar el celular se vuelve a la misma altura de la página.
      if (cyPendiente.current == null && cyAntes != null) cyPendiente.current = cyAntes;
      reencuadrarRef.current('arriba', false);
      aplicarCyPendienteRef.current();
      mostrarDestelloRef.current();
      ubicarCintaRef.current();
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
    if (enMedidaRef.current) {
      // La hoja que se ve y sus vecinas; y las páginas de al lado, acomodadas (para volver atrás).
      const claves = [hojaActual(), hojaSiguiente(), hojaAnterior()].filter((k): k is number => k != null);
      medida.current?.pedir(claves, [p, p + 1, p - 1].filter((i) => i >= 0 && i < totalRef.current));
      // La página original se sigue dibujando: la usan el resaltador, el lápiz y el recuadro.
      paginas.current?.pedir([p]);
      setDibujada(!!medida.current?.obtener(hojaActual()));
      return;
    }
    medida.current?.pedir([]);
    if (esDoble()) {
      const { izquierda: iz, derecha: de } = pliego(p);
      paginas.current?.pedir([de, iz, de + 1, de + 2, iz - 1, iz - 2]);
    } else paginas.current?.pedir([p, p + 1, p - 1, p + 2, p - 2]);
    setDibujada(visibles().every((i) => !!paginas.current?.obtener(i)));
  };
  const pedirPaginasRef = useRef(pedirPaginas);
  pedirPaginasRef.current = pedirPaginas;

  /**
   * Guarda dónde voy: la página, la altura en ella (con zoom o de lado), el capítulo, mi ritmo y
   * cuánto me falta. Mientras estoy viendo otra parte (una frase, el índice…), no: mi lugar sigue
   * siendo el de antes, hasta que siga leyendo desde ahí.
   */
  const anotar = useCallback(() => {
    if (!listoRef.current || regresoRef.current || !totalRef.current) return;
    const p = paginaRef.current;
    const f = falta(ritmoRef.current, capitulosRef.current, p, totalRef.current);
    const avance: Avance = {
      libroId,
      pagina: p,
      total: totalRef.current,
      actualizado: Date.now(),
      capitulo: capituloDe(capitulosRef.current, p),
      cy: cyRef.current,
      parte: enMedidaRef.current ? parteRef.current : undefined,
      ritmo: ritmoRef.current,
      falta: f ? { libro: f.libro, capitulo: f.capitulo ?? undefined } : undefined,
    };
    void guardarAvance(avance);
    anotarAvance(avance);
  }, [anotarAvance, libroId]);
  anotarRef.current = anotar;

  const capitulo = pagina !== null ? capituloDe(capitulos, pagina) : undefined;

  // «A tu medida»: al pasar a otra hoja de la misma página, también se recuerda.
  useEffect(() => {
    if (!enMedidaRef.current) return;
    const t = setTimeout(() => anotar(), 300);
    return () => clearTimeout(t);
  }, [parte, anotar]);

  useEffect(() => {
    if (pagina === null || !doc || !libro) return;
    pedirPaginas();
    motor.current?.quitarDetalles();
    if (necesitaDetalle(zoomRef.current)) programarDetalle();
    ubicarCintaRef.current();
    const t = setTimeout(() => {
      cyRef.current = vistaCy();
      anotar();
    }, 250);
    return () => clearTimeout(t);
    // pedirPaginas y vistaCy leen refs: no hace falta ponerlas como dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, doc, libro, anotar, regreso, capitulos]);

  // La luz del papel sigue a la hora: se revisa cada minuto.
  useEffect(() => {
    if (!luzAuto) return;
    const t = window.setInterval(() => setReloj(Date.now()), 60e3);
    return () => clearInterval(t);
  }, [luzAuto]);

  // La pantalla no se apaga mientras leo. Si nadie la toca en 10 minutos (me quedé dormido), sí.
  useEffect(() => {
    let candado: WakeLockSentinel | null = null;
    let vivo = true;
    let quieto = 0;
    const pedir = async () => {
      if (candado || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      try {
        const c = await navigator.wakeLock.request('screen');
        if (!vivo) return void c.release();
        candado = c;
        c.addEventListener('release', () => candado === c && (candado = null));
      } catch {
        /* sin permiso o con poca batería: la pantalla se apaga como siempre */
      }
    };
    const soltar = () => {
      void candado?.release();
      candado = null;
    };
    const actividad = () => {
      clearTimeout(quieto);
      quieto = window.setTimeout(soltar, 10 * 60e3);
      void pedir();
    };
    const alCambiar = () => {
      if (document.visibilityState === 'visible') {
        actividad();
        inicioPagina.current = performance.now(); // el tiempo fuera de la app no cuenta en el ritmo
      } else soltar();
    };
    actividad();
    actividadRef.current = actividad;
    document.addEventListener('visibilitychange', alCambiar);
    window.addEventListener('pointerdown', actividad, true);
    window.addEventListener('keydown', actividad, true);
    return () => {
      vivo = false;
      actividadRef.current = () => {};
      clearTimeout(quieto);
      soltar();
      document.removeEventListener('visibilitychange', alCambiar);
      window.removeEventListener('pointerdown', actividad, true);
      window.removeEventListener('keydown', actividad, true);
    };
  }, []);

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

  // Con el resaltador, el lápiz o el recuadro se lee la capa de texto de las páginas visibles (una vez por página).
  useEffect(() => {
    const d = docActual.current;
    if (pagina === null || !d || (herramienta !== 'resaltador' && herramienta !== 'lapiz' && herramienta !== 'recuadro')) return;
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
    // Al dejar la herramienta (o cambiarla), el recuadro que esperaba se guarda.
    if (herramienta !== 'recuadro') marcador.current?.terminar();
    else marcador.current?.cancelar();
  }, [herramienta]);

  // «A tu medida»: al elegirla, al cambiar el tamaño de la letra o al tomar una herramienta.
  useEffect(() => {
    const med = medida.current;
    if (med && med.opciones.letra !== letraMedida) {
      // Se sigue leyendo en el mismo renglón: la primera palabra de la hoja que se ve.
      const p = paginaRef.current;
      const primera = med.disposicion(p)?.hojas[parteRef.current]?.piezas[0];
      if (enMedidaRef.current && primera) partePendiente.current = { pagina: p, rect: { x0: primera.sx, y0: primera.sy, x1: primera.sx + primera.sw, y1: primera.sy + primera.sh } };
      med.configurar({ ...med.opciones, letra: letraMedida });
      if (enMedidaRef.current) {
        motor.current?.poner(escenaQuieta());
        pedirPaginasRef.current();
      }
    }
    actualizarMedidaRef.current();
    // escenaQuieta lee refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaMedidaElegida, letraMedida, herramienta]);

  // Al salir del libro se vuelve a leer: la próxima vez el dedo pasa la hoja.
  useEffect(
    () => () => {
      marcador.current?.terminar();
      useFrases.getState().usar(null);
    },
    [],
  );

  /** Vista previa de la marca mientras el dedo la hace (encima de la página que se marca). */
  const dibujarPrevia = useCallback((pv: Previa) => {
    const c = lienzoPrevia.current;
    if (!c) return;
    // Borrar no depende de nada más (si no, la vista previa podía quedarse pegada).
    if (!pv) {
      // Se reinicia el lienzo entero (un clearRect a veces no alcanzaba a borrar en Chrome; volver
      // a ponerle el mismo ancho tampoco siempre: primero se deja en cero).
      const { width, height } = c;
      c.width = 0;
      c.width = width;
      c.height = height;
      return;
    }
    const pags = paginas.current;
    const mp = marcaPagina.current;
    if (!pags || !mp) return;
    const tam = pags.lienzoTam;
    const ub = pags.ubicacion(mp.indice);
    if (!tam || !ub) return;
    if (c.width !== tam.ancho || c.height !== tam.alto) {
      c.width = tam.ancho;
      c.height = tam.alto;
    }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    const u = { x: ub.x, y: ub.y, escala: ub.escala, dpr: tam.dpr };
    if (pv.tipo === 'recuadro' && pv.caja) {
      recuadroEnCurso(ctx, pv.caja, u, pv.renglones, useAjustes.getState().papel === 'noche');
      return;
    }
    ctx.globalCompositeOperation = 'multiply';
    dibujarFrase(ctx, { id: 'previa', ...pv }, u);
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  /**
   * Saltar a otra página (una frase, el índice, la barra). Salvo que se diga lo contrario, donde
   * iba queda guardado para volver con «Volver a la pág. …».
   */
  const irA = useCallback(
    (n: number, opciones: { regreso?: boolean; cy?: number } = {}) => {
      if (!doc) return;
      const destino = Math.max(0, Math.min(doc.numPages - 1, n));
      const aqui = paginaRef.current;
      if (opciones.regreso !== false && destino !== aqui) {
        if (regresoRef.current?.pagina === destino) ponerRegresoRef.current(null);
        else if (!regresoRef.current)
          ponerRegresoRef.current({ pagina: aqui, cy: vistaCyRef.current(), parte: enMedidaRef.current ? parteRef.current : undefined });
        else pasesDesdeSalto.current = 0;
      }
      paginaRef.current = destino;
      parteRef.current = 0;
      setParte(0);
      inicioPagina.current = performance.now();
      cyPendiente.current = opciones.cy ?? null;
      setPagina(destino);
      void revisarMemoria();
      motor.current?.poner(escenaQuieta());
      reencuadrarRef.current('arriba', false);
      aplicarCyPendienteRef.current();
      // En «A tu medida», en la misma página: la página no cambia, pero la hoja sí.
      if (enMedidaRef.current && destino === aqui) {
        pedirPaginasRef.current();
        mostrarDestelloRef.current();
      }
    },
    [doc, revisarMemoria, escenaQuieta],
  );

  /** «Volver a la pág. …»: justo donde iba, a la misma altura. */
  const volverAlLugar = () => {
    const r = regresoRef.current;
    if (!r) return;
    ponerRegreso(null);
    irA(r.pagina, { regreso: false, cy: r.cy });
    if (r.parte == null || !enMedidaRef.current) return;
    // La hoja donde iba (ahora, si la página ya está acomodada; si no, cuando lo esté).
    const n = medida.current?.partes(r.pagina);
    if (n != null) irAParteRef.current(Math.min(n - 1, r.parte));
    else partePendiente.current = { pagina: r.pagina, parte: r.parte };
  };

  /** Desde el índice: ir al marcador (la línea brilla al llegar). */
  const irAlMarcador = () => {
    const m = marcadorRef.current;
    if (!m) return;
    destelloPendiente.current = { pagina: m.pagina, rects: [m], mensaje: 'Aquí te quedaste' };
    if (m.pagina === paginaRef.current) {
      cyPendiente.current = (m.y0 + m.y1) / 2;
      aplicarCyPendiente();
      mostrarDestello();
    } else irA(m.pagina, { cy: (m.y0 + m.y1) / 2 });
  };

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

  const luz = luzActual({ luzAuto, brillo, tibieza }, new Date(reloj));

  // El grosor del libro sobre la mesa: los cantos de las hojas leídas a la izquierda y de las que
  // faltan a la derecha (en px, sin zoom). Un libro de 500 páginas tiene unos 21 px de hojas.
  const grosor = Math.min(26, 3 + 18 * Math.sqrt((doc?.numPages ?? 0) / 500));
  let cantoIzq = 0;
  let cantoDer = 0;
  if (doc && pagina !== null && disp?.modo === 'doble') {
    const { izquierda, derecha } = pliego(pagina);
    const f = Math.max(0, Math.min(1, (izquierda + 1) / doc.numPages));
    cantoIzq = izquierda >= 0 ? Math.max(1.5, grosor * f) : 0;
    cantoDer = derecha < doc.numPages ? Math.max(1.5, grosor * (1 - f)) : 0;
  } else if (doc && pagina !== null && disp?.modo === 'mesa') cantoDer = Math.max(1.5, grosor * (1 - pagina / doc.numPages));

  /** Desde «Buscar»: ir a la página (pudiendo volver) y que la palabra brille al llegar. */
  const irAResultado = async (r: Resultado, consulta: string) => {
    const d = docActual.current;
    let rects: Rango[] = [];
    try {
      const guardado = textos.current.get(r.pagina);
      const t = guardado && guardado !== 'leyendo' ? guardado : await leerTextoPagina(await d!.getPage(r.pagina + 1));
      textos.current.set(r.pagina, t);
      const c = coincidencias(t.letras.map((l) => (l.virtual ? ' ' : l.c)).join(''), consulta)[r.orden];
      const ub = paginas.current?.ubicacion(r.pagina) ?? paginas.current?.ubicacion(paginaRef.current);
      if (c && ub) {
        // Un rectángulo por renglón de la coincidencia.
        const porRenglon = new Map<number, Rango>();
        for (const l of t.letras.slice(c.inicio, c.fin)) {
          if (l.virtual) continue;
          const a = porRenglon.get(l.linea);
          const x0 = l.x0 / ub.ancho;
          const x1 = l.x1 / ub.ancho;
          const y0 = l.top / ub.alto;
          const y1 = l.bottom / ub.alto;
          porRenglon.set(l.linea, a ? { x0: Math.min(a.x0, x0), x1: Math.max(a.x1, x1), y0: Math.min(a.y0, y0), y1: Math.max(a.y1, y1) } : { x0, x1, y0, y1 });
        }
        rects = [...porRenglon.values()];
      }
    } catch {
      /* sin capa de texto: se va a la página igual */
    }
    if (rects.length) destelloPendiente.current = { pagina: r.pagina, rects };
    irA(r.pagina, { cy: rects.length ? (rects[0].y0 + rects[0].y1) / 2 : undefined });
    mostrarDestello();
  };

  // ---------- 6. Lectura en voz alta ----------
  // Las voces en español del sistema (llegan de a poco: se escuchan los cambios).
  useEffect(() => {
    if (!hayVoz()) return;
    const s = window.speechSynthesis;
    const cargar = () => {
      const vs = vocesEnEspanol(s.getVoices(), navigator.language);
      vocesRef.current = vs;
      setVoces(vs);
    };
    cargar();
    s.addEventListener?.('voiceschanged', cargar);
    return () => s.removeEventListener?.('voiceschanged', cargar);
  }, []);

  const vozElegida = () => {
    const vs = vocesRef.current;
    const guardada = useAjustes.getState().voz;
    return vs.find((v) => v.voiceURI === guardada) ?? vs[0];
  };

  // Las voces de Entre Hojas: si ya se bajaron alguna vez y cuánto pesan.
  useEffect(() => motorVoces.oir(setEstadoVoces), []);
  useEffect(() => {
    if (!voz) return;
    void motorVoces.bajadas().then(setVocesBajadas);
    void motorVoces.revisar();
  }, [voz === null, estadoVoces.fase]); // eslint-disable-line react-hooks/exhaustive-deps

  const narradorSistema = useRef<Narrador | null>(null);
  const locutoresPropios = useRef(new Map<string, LocutorPropio>());
  /**
   * Quién lee: la voz propia elegida (mientras se baja la primera vez, sigue la del celular) o la
   * del sistema.
   */
  const locutorActual = (): Locutor => {
    const propia = vozPropia(useAjustes.getState().voz);
    const fase = motorVoces.estado.fase;
    // Mientras se baja la primera vez, lee la del celular (si el celular tiene voces en español).
    const sinSistema = !hayVoz() || !vocesRef.current.length;
    if (propia && (fase === 'lista' || fase === 'preparando' || sinSistema)) {
      let l = locutoresPropios.current.get(propia.id);
      if (!l) {
        l = new LocutorPropio(propia);
        locutoresPropios.current.set(propia.id, l);
      }
      return l;
    }
    const n = (narradorSistema.current ??= new Narrador());
    n.voz = vozElegida();
    return n;
  };

  // Cuando la voz propia queda lista, la oración sigue con ella.
  useEffect(() => {
    const l = lecturaVoz.current;
    if (estadoVoces.fase === 'lista' && l?.activa && vozPropia(useAjustes.getState().voz) && !(l.enUso instanceof LocutorPropio)) l.repetir();
    if (estadoVoces.fase === 'error' && vozPropia(useAjustes.getState().voz) && l?.activa)
      setMensaje({ texto: 'No se pudo bajar la voz: sigo con la del celular.', clave: Date.now() });
  }, [estadoVoces.fase]);

  /** El texto de una página para leerlo en voz alta, con la medida de la página (sus unidades). */
  const textoParaVoz = async (i: number) => {
    const d = docActual.current;
    if (!d) return null;
    const pg = await d.getPage(i + 1);
    const vista = pg.getViewport({ scale: 1 });
    const guardado = textos.current.get(i);
    const t = guardado && guardado !== 'leyendo' ? guardado : await leerTextoPagina(pg);
    textos.current.set(i, t);
    return { texto: t, ancho: vista.width, alto: vista.height };
  };

  /** Con la vista movible (zoom o de lado): a qué altura de la página está el borde de arriba. */
  const alturaArriba = (): number | undefined => {
    if (enMedidaRef.current) {
      // Desde la primera palabra de la hoja que se ve.
      const dis = medida.current?.disposicion(paginaRef.current);
      const primera = dis?.hojas[parteRef.current]?.piezas[0];
      return dis && primera ? Math.max(0, (primera.sy + primera.sh * 0.3) / dis.alto) : undefined;
    }
    const d = dispRef.current;
    const v = vistaTam();
    if (!d || !v || d.modo === 'doble' || !sePuedeMover()) return undefined;
    const r = paginas.current?.rectPagina(paginaRef.current) ?? d.caja;
    const y = aLienzo(zoomRef.current, v.w / 2, margenesSeguros().arriba + 4).y;
    return Math.max(0, Math.min(1, (y - d.hoja.y - r.y) / r.h));
  };

  /**
   * Leer en voz alta desde el marcador (si está en estas páginas), desde lo que se ve (con zoom o
   * de lado) o desde arriba. Al terminar la página, la hoja pasa sola y se sigue leyendo.
   */
  const leerEnVoz = () => {
    // Sin voces en español en el teléfono (y sin una elegida), se usa una de Entre Hojas.
    if (!useAjustes.getState().voz && !vocesRef.current.length) useAjustes.getState().poner({ voz: VOCES_PROPIAS[0].id });
    const propia = vozPropia(useAjustes.getState().voz);
    if (propia) void motorVoces.cargar().catch(() => {});
    if (!hayVoz() && !propia) {
      setMensaje({ texto: 'Este navegador no puede leer en voz alta.', clave: Date.now() });
      return;
    }
    let l = lecturaVoz.current;
    if (!l) {
      l = new LecturaEnVoz({
        texto: textoParaVoz,
        visibles,
        total: () => totalRef.current,
        pasar: () => {
          // En «A tu medida», la voz terminó la página: se va a su última hoja y de ahí a la siguiente.
          const n = medida.current?.partes(paginaRef.current);
          if (enMedidaRef.current && n != null && parteRef.current < n - 1) irAParteRef.current(n - 1);
          pasador.current?.pasarSola('adelante');
        },
        locutor: locutorActual,
        velocidad: () => useAjustes.getState().velocidadVoz,
        alCambiar: (e) => {
          vozRef.current = e;
          setVoz(e);
        },
        alAviso: (texto) => setMensaje({ texto, clave: Date.now() }),
        alHablar: () => actividadRef.current(),
      });
      lecturaVoz.current = l;
    }
    setCromo(false);
    sonido.despertar();
    // La primera vez, se avisa de las voces nuevas.
    if (!useAjustes.getState().avisoVoces && !propia) {
      useAjustes.getState().poner({ avisoVoces: true });
      setMensaje({ texto: 'Voces nuevas: Lucía, Elena, Mateo y Andrés · toca el nombre de la voz para elegir', clave: Date.now() });
    }
    const vis = visibles();
    const m = marcadorRef.current;
    const marca = m && vis.includes(m.pagina) ? m : null;
    const arriba = marca ? undefined : alturaArriba();
    l.empezar(marca?.pagina ?? vis[0] ?? paginaRef.current, (t, ors) => {
      if (marca) return oracionEn(ors, letraEn(t.texto, marca.x0 * t.ancho + 2, ((marca.y0 + marca.y1) / 2) * t.alto, 40));
      return arriba != null ? oracionDesdeAltura(t.texto, ors, t.alto, arriba) : 0;
    });
  };

  /** Con zoom o de lado: si la oración que se lee queda fuera de la vista, la vista va hacia ella. */
  const seguirVoz = (e: EstadoVoz) => {
    if (enMedidaRef.current) {
      // La oración que se lee está en una hoja más adelante de la misma página: se pasa la hoja.
      const dis = medida.current?.disposicion(e.pagina);
      const r = e.rangos[0];
      if (!dis || !r || e.pagina !== paginaRef.current || pasador.current?.ocupado || gestos.current?.ocupado) return;
      const j = parteDe(dis, { x0: r.x0 * dis.ancho, y0: r.y0 * dis.alto, x1: r.x1 * dis.ancho, y1: r.y1 * dis.alto });
      if (j > parteRef.current) pasador.current?.pasarSola('adelante');
      return;
    }
    const v = vistaTam();
    if (!e.rangos.length || !v || !sePuedeMover() || gestos.current?.ocupado || pasador.current?.ocupado) return;
    const a = rectMarcaPantalla({ pagina: e.pagina, ...e.rangos[0] });
    const b = rectMarcaPantalla({ pagina: e.pagina, ...e.rangos[e.rangos.length - 1] });
    if (!a || !b) return;
    const s = margenesSeguros();
    const arriba = s.arriba + 16;
    const abajo = v.h - s.abajo - 100; // sobre el reproductor
    if (a.y >= arriba && b.y + b.h <= abajo) return;
    const z = zoomRef.current;
    ponerZoom({ ...z, y: z.y + arriba + (abajo - arriba) * 0.15 - a.y }, true);
  };

  useLayoutEffect(() => {
    ubicarVoz();
    if (voz?.fase === 'leyendo') seguirVoz(voz);
    // ubicarVoz y seguirVoz leen refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voz]);

  // La página cambió (la pasó la voz, la pasé yo o salté a otra): se sigue leyendo desde ahí.
  useEffect(() => {
    lecturaVoz.current?.cambioDePagina();
  }, [pagina]);

  // Al salir del libro, la voz se calla.
  useEffect(() => () => lecturaVoz.current?.detener(), []);

  const cambiarVelocidad = () => {
    const i = VELOCIDADES.indexOf(velocidadVoz);
    useAjustes.getState().poner({ velocidadVoz: VELOCIDADES[(i + 1) % VELOCIDADES.length] });
    lecturaVoz.current?.repetir();
  };
  const propiaElegida = vozPropia(vozGuardada);
  const vozActual = propiaElegida ? undefined : (voces.find((v) => v.voiceURI === vozGuardada) ?? voces[0]);
  const nombres = nombresVoces(voces);
  const nombreVoz = propiaElegida ? propiaElegida.nombre : vozActual ? nombres[voces.indexOf(vozActual)] : 'voz del sistema';
  const estadoVozPropia =
    propiaElegida && estadoVoces.fase === 'bajando'
      ? ` · bajando ${Math.round(estadoVoces.avance * 100)} %`
      : propiaElegida && estadoVoces.fase === 'preparando'
        ? ' · preparando…'
        : propiaElegida && estadoVoces.fase === 'error'
          ? ' · no se pudo bajar'
          : '';
  const elegirVoz = (id: string) => {
    useAjustes.getState().poner({ voz: id });
    if (vozPropia(id)) void motorVoces.cargar().catch(() => {});
    lecturaVoz.current?.repetir();
  };

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
  const faltaAhora = pagina !== null ? falta(ritmo, capitulos, pagina, total) : null;
  const irASalto = () => {
    if (saltoA !== null) irA(saltoA);
    setSaltoA(null);
  };

  return (
    <div
      className={`lector ${enMesa ? 'en-mesa' : ''} ${disp?.modo === 'doble' ? 'en-doble' : ''} ${hayZoom ? 'con-zoom' : ''} ${pasando ? 'pasando' : ''} ${voz ? 'con-voz' : ''} papel-fondo-${papel}`}
    >
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
          <div ref={sombraLibro} className="sombra-hoja" style={{ width: disp.libro.w, height: disp.libro.h, transform: `translate(${disp.libro.x}px, ${disp.libro.y}px)` }}>
            {disp.modo === 'doble' && <div className="tapa" style={{ left: -cantoIzq - 6, right: -cantoDer - 6 }} />}
            {cantoIzq > 0 && <div className="canto canto-izq" style={{ width: cantoIzq }} />}
            {cantoDer > 0 && <div className="canto canto-der" style={{ width: cantoDer }} />}
          </div>
        )}
        <canvas ref={lienzo} className="lienzo-hoja" />
        {disp && (
          <canvas
            ref={lienzoPrevia}
            className={`lienzo-previa ${noche ? 'en-noche' : ''}`}
            style={{ width: disp.hoja.w, height: disp.hoja.h, transform: `translate(${disp.hoja.x}px, ${disp.hoja.y}px)` }}
          />
        )}
        {/* La cinta del marcador, en el borde de la hoja (se esconde mientras la hoja se pasa). */}
        <div ref={cintaRef} className="cinta-lectura" style={{ display: 'none' }} aria-hidden="true" />
        {destellos?.rects.map((r, k) => (
          <div
            key={`${destellos.clave}-${k}`}
            className="destello"
            style={{ left: r.x - 6, top: r.y - 4, width: r.w + 12, height: r.h + 8 }}
            onAnimationEnd={() => k === destellos.rects.length - 1 && setDestellos(null)}
            aria-hidden="true"
          />
        ))}
        {/* La oración que lee la voz, iluminada (un rectángulo por renglón; se ubican al hacer zoom). */}
        <div ref={capaVoz} className={`capa-voz ${voz?.fase === 'pausa' ? 'en-pausa' : ''}`} aria-hidden="true">
          {/* En «A tu medida» una línea puede quedar partida en dos o tres renglones. */}
          {Array.from({ length: (voz?.rangos.length ?? 0) * 3 }, (_, k) => (
            <div key={k} className="voz-frase" style={{ display: 'none' }} />
          ))}
        </div>
        {/* Luz del papel: de noche, más cálida y tenue (como bajo una lámpara). */}
        <div className="luz-papel" style={{ opacity: luz.tibieza * 0.34 }} aria-hidden="true" />
        <div className="luz-tenue" style={{ opacity: (1 - luz.brillo) * 0.9 }} aria-hidden="true" />
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
        {disp?.modo === 'celular' && (
          <button
            className={`icono-barra aa ${enMedida ? 'on' : ''}`}
            onClick={() => setVistaAbierta(true)}
            aria-label="Cómo ver la página"
            title="Cómo ver la página"
          >
            Aa
          </button>
        )}
        <button
          className={`icono-barra ${voz ? 'on' : ''}`}
          onClick={() => (voz ? lecturaVoz.current?.detener() : leerEnVoz())}
          aria-label={voz ? 'Dejar de leer en voz alta' : 'Leer en voz alta'}
          aria-pressed={!!voz}
          title="Leer en voz alta"
        >
          <Icono nombre="audifonos" tam={19} />
        </button>
        <button className="icono-barra" onClick={() => setBuscarAbierto(true)} aria-label="Buscar en el libro" title="Buscar en el libro">
          <Icono nombre="search" tam={19} />
        </button>
        <button className="icono-barra" onClick={() => setIndiceAbierto(true)} aria-label="Índice" title="Índice">
          <Icono nombre="lista" tam={20} />
        </button>
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
        {faltaAhora && (
          <span className="cromo-falta">
            <Icono nombre="reloj" tam={14} />
            <span>
              {faltaAhora.capitulo != null ? (
                <>
                  <b>{tiempoLegible(faltaAhora.capitulo)}</b> para terminar el capítulo · {tiempoLegible(faltaAhora.libro)} el libro
                </>
              ) : (
                <>
                  <b>{tiempoLegible(faltaAhora.libro)}</b> para terminar el libro
                </>
              )}
            </span>
          </span>
        )}
        <span className="cromo-pag">{etiquetaPagina}</span>
        <span className="pista-capitulos">
          {total > 1 &&
            capitulos
              .filter((c) => c.pagina > 0)
              .map((c, i) => <i key={i} style={{ left: `calc(10px + (100% - 20px) * ${c.pagina / (total - 1)})` }} />)}
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
        </span>
        <span className="cromo-pag">de {miles(total)}</span>
      </div>

      {conPanel && libro && (
        <PanelFrases libroId={libro.id} alIr={irA} alCerrar={() => useAjustes.getState().poner({ panelFrases: false })} />
      )}

      <AvisoModo texto={recuadro ? 'Ajusta las esquinas o arrastra otro' : undefined} />
      {recuadro && herramienta === 'recuadro' && (
        <div
          className={`barra-recuadro ${recuadro.abajo > window.innerHeight - 190 ? 'arriba' : ''}`}
          role="toolbar"
          aria-label="Recuadro"
        >
          <span className="pista">Mueve las esquinas para ajustarlo</span>
          <div>
            <button className="x" aria-label="Descartar el recuadro" onClick={() => marcador.current?.descartar()}>
              <Icono nombre="x" tam={18} />
            </button>
            <button onClick={() => marcador.current?.confirmar(false)}>
              <Icono nombre="check" tam={16} grosor={2.6} /> Guardar
            </button>
            <button className="principal" onClick={() => marcador.current?.confirmar(true)}>
              <Icono nombre="share" tam={16} /> Compartir
            </button>
          </div>
        </div>
      )}
      <AvisoBreve mensaje={mensaje} alCerrar={cerrarMensaje} />
      {compartirDe && <CompartirFrase f={compartirDe} alCerrar={() => setCompartirDe(null)} />}
      {vistaAbierta && <VistaPagina deLado={!!disp && disp.modo === 'celular' && anchoVentana > (vistaMedida.current?.h ?? 0)} alCerrar={() => setVistaAbierta(false)} />}
      {regreso && !herramienta && (
        <button className={`volver-lugar ${cromo && !enMesa ? 'bajo-cromo' : ''} ${enMesa ? 'en-mesa' : ''}`} onClick={volverAlLugar}>
          <span className="cinta-chica" aria-hidden="true" />
          Volver a la pág. {miles(regreso.pagina + 1)} <small>· donde ibas</small>
        </button>
      )}
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

      {voz && (
        <div
          className={`voz-zona ${cromo && !enMesa ? 'sobre-cromo' : ''} ${enMesa ? 'en-mesa' : ''} ${boton.y > 0.7 ? `libre-${boton.lado}` : ''}`}
          style={conPanel ? { right: PANEL } : undefined}
        >
          <div className="voz-alta" role="region" aria-label="Lectura en voz alta">
            <button
              className="voz-boton"
              onClick={() => (voz.fase === 'pausa' ? lecturaVoz.current?.seguir() : lecturaVoz.current?.pausar())}
              aria-label={voz.fase === 'pausa' ? 'Seguir leyendo' : 'Pausar'}
            >
              <Icono nombre={voz.fase === 'pausa' ? 'play' : 'pausa'} tam={19} />
            </button>
            <div className="voz-textos">
              <b>{voz.fase === 'pausa' ? 'En pausa' : voz.fase === 'pasando' ? 'Pasando la hoja…' : 'Leyendo en voz alta'}</b>
              <span className="voz-sub">
                Pág. {miles(voz.pagina + 1)} ·{' '}
                <label className="voz-elegir">
                  {nombreVoz}
                  {estadoVozPropia}
                  <select value={propiaElegida?.id ?? vozActual?.voiceURI ?? ''} aria-label="Voz" onChange={(e) => elegirVoz(e.target.value)}>
                    <optgroup label="Voces de Entre Hojas (español latino)">
                      {VOCES_PROPIAS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nombre} ({v.genero}){vocesBajadas ? '' : ` · se baja una vez, ${estadoVoces.mb} MB`}
                        </option>
                      ))}
                    </optgroup>
                    {voces.length > 0 && (
                      <optgroup label="Del celular">
                        {voces.map((v, k) => (
                          <option key={v.voiceURI} value={v.voiceURI}>
                            {nombres[k]}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {!voces.length && !propiaElegida && <option value="">voz del sistema</option>}
                  </select>
                </label>
              </span>
            </div>
            <button className="voz-vel" onClick={cambiarVelocidad} aria-label={`Velocidad: ${velocidadVoz.toLocaleString('es')}×. Tocar para cambiar`}>
              {velocidadVoz.toLocaleString('es')}×
            </button>
            <button className="voz-cerrar" onClick={() => lecturaVoz.current?.detener()} aria-label="Dejar de leer">
              <Icono nombre="x" tam={18} />
            </button>
          </div>
        </div>
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
      {buscarAbierto && doc && (
        <BuscarLibro
          doc={docActual.current ?? doc}
          libroId={libroId}
          capitulos={capitulos}
          alIr={(r, consulta) => {
            setBuscarAbierto(false);
            void irAResultado(r, consulta);
          }}
          alCerrar={() => setBuscarAbierto(false)}
        />
      )}
      {indiceAbierto && (
        <Indice
          capitulos={capitulos}
          origen={origenIndice}
          pagina={pagina ?? 0}
          total={total}
          marcador={marcaLectura}
          ritmo={ritmo}
          alIr={(p) => {
            setIndiceAbierto(false);
            irA(p);
          }}
          alMarcador={() => {
            setIndiceAbierto(false);
            irAlMarcador();
          }}
          alCerrar={() => setIndiceAbierto(false)}
        />
      )}
    </div>
  );
}
