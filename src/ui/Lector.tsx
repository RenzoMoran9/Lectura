// Pantalla de lectura: la hoja en WebGL, el gesto de pasarla, el sonido y el recuerdo de la página.

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
import { densidad, disponer, type Disposicion, type Margenes } from '../hoja/maqueta';
import { MotorHoja } from '../hoja/motor';
import { Pasador, type Pase } from '../hoja/pasador';
import { abrirPdf, bytesLeidos, cerrarPdf, type DocumentoPdf } from '../pdf/pdf';
import { Paginas } from '../pdf/paginas';
import { sonido } from '../sonido/sonido';
import { AvisoBreve, AvisoModo, type Mensaje } from './Avisos';
import { Icono } from './Icono';
import { MenuEsquina } from './MenuEsquina';
import { PapelYSonido } from './PapelYSonido';

const miles = (n: number) => n.toLocaleString('es');

/**
 * PDF.js guarda en memoria cada parte del archivo que ya leyó. Pasado este límite, el libro se
 * vuelve a abrir en silencio para soltar esa memoria (importa con libros escaneados enormes).
 */
const LIMITE_LEIDO = (import.meta.env.DEV && (globalThis as { __limiteLeido?: number }).__limiteLeido) || 160e6;

/** Márgenes seguros del sistema (muesca, barra de inicio), leídos de CSS. */
function margenesSeguros(sonda: HTMLElement | null): Margenes {
  if (!sonda) return { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 };
  const e = getComputedStyle(sonda);
  const n = (v: string) => parseFloat(v) || 0;
  return { arriba: n(e.paddingTop), abajo: n(e.paddingBottom), izquierda: n(e.paddingLeft), derecha: n(e.paddingRight) };
}

export function Lector({ libroId, paginaPedida, desde }: { libroId: string; paginaPedida?: number; desde?: 'inicio' | 'frases' }) {
  const volver = useLibros((s) => s.volver);
  const verFrases = useLibros((s) => s.verFrases);
  const anotarAvance = useLibros((s) => s.anotarAvance);
  const papel = useAjustes((s) => s.papel);
  const herramienta = useFrases((s) => s.herramienta);

  const contenedor = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const sonda = useRef<HTMLDivElement>(null);

  const [libro, setLibro] = useState<Libro | null>(null);
  const [doc, setDoc] = useState<DocumentoPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagina, setPagina] = useState<number | null>(null);
  const [disp, setDisp] = useState<Disposicion | null>(null);
  const [cromo, setCromo] = useState(false);
  const [panel, setPanel] = useState(false);
  const [dibujada, setDibujada] = useState(false);
  const [saltoA, setSaltoA] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const cerrarMensaje = useCallback(() => setMensaje(null), []);
  const lienzoPrevia = useRef<HTMLCanvasElement>(null);
  const marcador = useRef<Marcador | null>(null);
  const textos = useRef(new Map<number, TextoPagina | 'leyendo'>());
  const borradasGesto = useRef<Frase[]>([]);

  const motor = useRef<MotorHoja | null>(null);
  const paginas = useRef<Paginas | null>(null);
  const pasador = useRef<Pasador | null>(null);
  const paginaRef = useRef(0);
  const dispRef = useRef<Disposicion | null>(null);

  const archivoRef = useRef<Blob | null>(null);
  const docActual = useRef<DocumentoPdf | null>(null);
  const reciclando = useRef(false);

  // 1. Abrir el libro guardado, por partes, en la página donde me quedé.
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
      const av = await leerAvance(l.id);
      if (!vivo) return;
      const inicial = Math.max(0, Math.min(d.numPages - 1, paginaPedida ?? av?.pagina ?? 0));
      paginaRef.current = inicial;
      setLibro(l);
      setDoc(d);
      setPagina(inicial);
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

  // 2. Motor WebGL, páginas y gesto.
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

    const pags = new Paginas(doc);
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
      if (i === paginaRef.current) setDibujada(true);
    };
    pags.onSoltada = (i) => {
      lienzosMarcas.delete(i);
      m.soltarPagina(i);
    };

    marcador.current = new Marcador({
      herramienta: () => useFrases.getState().herramienta,
      color: () => {
        const a = useAjustes.getState();
        return useFrases.getState().herramienta === 'lapiz' ? a.colorLapiz : a.colorResaltador;
      },
      libroId: () => libro.id,
      pagina: () => paginaRef.current,
      ubicacion: () => pags.ubicacion(paginaRef.current),
      texto: () => {
        const t = textos.current.get(paginaRef.current);
        return t && t !== 'leyendo' ? t : null;
      },
      lienzoPagina: () => {
        const lienzo = pags.obtener(paginaRef.current);
        const tam = pags.lienzoTam;
        return lienzo && tam ? { lienzo, dpr: tam.dpr } : undefined;
      },
      frasesPagina: () => useFrases.getState().frases.filter((f) => f.libroId === libro.id && f.pagina === paginaRef.current),
      previa: (p) => dibujarPrevia(p),
      guardar: (f, donde) => {
        void useFrases.getState().agregar({ ...f, libroTitulo: libro.titulo });
        // La marca ya quedó en la página: la vista previa se borra en cuanto se dibuja.
        requestAnimationFrame(() => requestAnimationFrame(() => dibujarPrevia(null)));
        const r = contenedor.current?.getBoundingClientRect();
        const h = dispRef.current?.hoja;
        setMensaje({ texto: 'Guardada en Mis frases', x: (r?.left ?? 0) + (h?.x ?? 0) + donde.x, y: (r?.top ?? 0) + (h?.y ?? 0) + donde.y, clave: Date.now() });
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

    const quieta = () => m.poner({ hoja: paginaRef.current, debajo: null, doblez: null, sombra: 0 });

    const p = new Pasador({
      tamano: () => {
        const h = dispRef.current?.hoja;
        return { w: h?.w ?? 1, h: h?.h ?? 1 };
      },
      puede: (s) => (s === 'adelante' ? paginaRef.current < doc.numPages - 1 : paginaRef.current > 0),
      alCambiar: (pase: Pase | null) => {
        if (!pase) return quieta();
        const actual = paginaRef.current;
        m.poner(
          pase.sentido === 'adelante'
            ? { hoja: actual, debajo: actual + 1, doblez: pase.doblez, sombra: pase.sombra }
            : { hoja: actual - 1, debajo: actual, doblez: pase.doblez, sombra: pase.sombra },
        );
      },
      alTerminar: (s: Sentido, paso: boolean) => {
        sonido.pararRoce();
        if (paso) {
          paginaRef.current += s === 'adelante' ? 1 : -1;
          setPagina(paginaRef.current);
          void revisarMemoria();
        }
        quieta();
      },
      alTocar: () => !useFrases.getState().herramienta && setCromo((c) => !c),
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
    quieta();

    return () => {
      dejarDeEscuchar();
      marcador.current = null;
      p.destruir();
      pags.destruir();
      m.destruir();
      motor.current = null;
      paginas.current = null;
      pasador.current = null;
    };
  }, [doc, libro, revisarMemoria]);

  // 3. Medir la pantalla y acomodar la hoja (también al girar el celular).
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
      const d = disponer(w, h, margenesSeguros(sonda.current), aspecto);
      const dpr = densidad(window.devicePixelRatio, d.hoja.w, d.hoja.h);
      dispRef.current = d;
      setDisp(d);
      pasador.current?.cancelar();
      marcador.current?.cancelar();
      motor.current?.medir(w, h, dpr, d.hoja, d.modo === 'mesa');
      paginas.current?.configurar({ ancho: d.hoja.w, alto: d.hoja.h, dpr, caja: d.caja, titulo: libro.titulo });
    };
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    medir();
    return () => {
      vivo = false;
      obs.disconnect();
    };
  }, [doc, libro]);

  // 4. Al cambiar de página: dibujar la actual y sus vecinas, y recordar dónde voy.
  const pendiente = useRef<Avance | null>(null);
  const anotar = useCallback(() => {
    const avance = pendiente.current;
    if (!avance) return;
    pendiente.current = null;
    void guardarAvance(avance);
    anotarAvance(avance);
  }, [anotarAvance]);

  useEffect(() => {
    if (pagina === null || !doc || !libro) return;
    paginas.current?.pedir([pagina, pagina + 1, pagina - 1, pagina + 2, pagina - 2]);
    setDibujada(!!paginas.current?.obtener(pagina));
    pendiente.current = { libroId: libro.id, pagina, total: doc.numPages, actualizado: Date.now() };
    const t = setTimeout(anotar, 250);
    return () => clearTimeout(t);
  }, [pagina, doc, libro, anotar]);

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

  // Con el resaltador o el lápiz se lee la capa de texto de la página (una vez por página).
  useEffect(() => {
    const d = docActual.current;
    if (pagina === null || !d || (herramienta !== 'resaltador' && herramienta !== 'lapiz')) return;
    const cache = textos.current;
    if (cache.has(pagina)) return;
    cache.set(pagina, 'leyendo');
    d.getPage(pagina + 1)
      .then(leerTextoPagina)
      .then((t) => cache.set(pagina, t))
      .catch(() => cache.delete(pagina));
    // Solo se guardan unas pocas páginas.
    if (cache.size > 12) cache.delete(cache.keys().next().value!);
  }, [pagina, herramienta, doc]);

  useEffect(() => {
    if (herramienta) setCromo(false);
    marcador.current?.cancelar();
  }, [herramienta]);

  // Al salir del libro se vuelve a leer: la próxima vez el dedo pasa la hoja.
  useEffect(() => () => useFrases.getState().usar(null), []);

  /** Vista previa de la marca mientras el dedo la hace (encima de la hoja). */
  const dibujarPrevia = useCallback((p: Previa) => {
    const c = lienzoPrevia.current;
    const pags = paginas.current;
    const h = dispRef.current?.hoja;
    if (!c || !pags || !h) return;
    const tam = pags.lienzoTam;
    const ub = pags.ubicacion(paginaRef.current);
    if (!tam || !ub) return;
    if (c.width !== tam.ancho || c.height !== tam.alto) {
      c.width = tam.ancho;
      c.height = tam.alto;
    }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!p) return;
    ctx.globalCompositeOperation = 'multiply';
    dibujarFrase(ctx, { id: 'previa', ...p }, { x: ub.x, y: ub.y, escala: ub.escala, dpr: tam.dpr });
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  // 5. Teclado: ← → (y avance de página) pasan la hoja con el mismo sonido.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (panel || e.altKey || e.metaKey || e.ctrlKey) return;
      const adelante = ['ArrowRight', 'PageDown', ' '].includes(e.key);
      const atras = ['ArrowLeft', 'PageUp'].includes(e.key);
      if (!adelante && !atras) return;
      e.preventDefault();
      sonido.despertar();
      pasador.current?.pasarSola(adelante ? 'adelante' : 'atras');
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [panel]);

  // Coordenadas de la hoja: origen abajo a la izquierda, en px CSS.
  const aHoja = useCallback((e: React.PointerEvent) => {
    const r = contenedor.current!.getBoundingClientRect();
    const h = dispRef.current?.hoja ?? { x: 0, y: 0, w: r.width, h: r.height };
    return { x: e.clientX - r.left - h.x, y: h.y + h.h - (e.clientY - r.top) };
  }, []);

  // Coordenadas para marcar: origen arriba a la izquierda de la hoja.
  const aHojaArriba = useCallback((e: React.PointerEvent) => {
    const r = contenedor.current!.getBoundingClientRect();
    const h = dispRef.current?.hoja ?? { x: 0, y: 0 };
    return { x: e.clientX - r.left - h.x, y: e.clientY - r.top - h.y };
  }, []);

  const bajar = (e: React.PointerEvent) => {
    if (e.button !== 0 || !pasador.current) return;
    sonido.despertar();
    if (useFrases.getState().herramienta && marcador.current) {
      // Con una herramienta, el dedo marca y la hoja no se pasa.
      if (pasador.current.ocupado) return;
      borradasGesto.current = [];
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const q = aHojaArriba(e);
      marcador.current.bajar(q.x, q.y, e.pointerId);
      return;
    }
    const p = aHoja(e);
    const h = dispRef.current?.hoja;
    // En pantalla ancha solo se toma la hoja (con un poco de margen a la derecha).
    if (h && dispRef.current?.modo === 'mesa' && (p.x < 0 || p.x > h.w + 24 || p.y < -12 || p.y > h.h + 12)) {
      if (!pasador.current.ocupado) setCromo((c) => !c);
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pasador.current.bajar(p.x, p.y, e.pointerId);
  };
  const mover = (e: React.PointerEvent) => {
    if (useFrases.getState().herramienta) {
      const q = aHojaArriba(e);
      return marcador.current?.mover(q.x, q.y, e.pointerId);
    }
    const p = aHoja(e);
    pasador.current?.mover(p.x, p.y, e.pointerId);
  };
  const subir = (e: React.PointerEvent) => {
    // En el celular el navegador solo deja encender el audio al levantar el dedo.
    sonido.despertar();
    marcador.current?.subir(e.pointerId);
    const p = aHoja(e);
    pasador.current?.subir(p.x, p.y, e.pointerId);
  };
  const cancelar = () => {
    marcador.current?.cancelar();
    pasador.current?.cancelar();
  };

  const irA = (n: number) => {
    if (!doc) return;
    const destino = Math.max(0, Math.min(doc.numPages - 1, n));
    paginaRef.current = destino;
    setPagina(destino);
    void revisarMemoria();
    motor.current?.poner({ hoja: destino, debajo: null, doblez: null, sombra: 0 });
  };

  const total = doc?.numPages ?? 0;
  const noche = papel === 'noche';
  const mostrada = saltoA ?? pagina ?? 0;

  return (
    <div className={`lector ${disp?.modo === 'mesa' ? 'en-mesa' : ''} papel-fondo-${papel}`}>
      <div className="sonda-segura" ref={sonda} aria-hidden="true" />
      <div
        ref={contenedor}
        className="lector-hoja"
        onPointerDown={bajar}
        onPointerMove={mover}
        onPointerUp={subir}
        onPointerCancel={cancelar}
        onLostPointerCapture={cancelar}
        onContextMenu={(e) => e.preventDefault()}
      >
        {disp?.modo === 'mesa' && (
          <div className="sombra-hoja" style={{ left: disp.hoja.x, top: disp.hoja.y, width: disp.hoja.w, height: disp.hoja.h }} />
        )}
        <canvas ref={lienzo} className="lienzo-hoja" />
        {disp && (
          <canvas
            ref={lienzoPrevia}
            className={`lienzo-previa ${noche ? 'en-noche' : ''}`}
            style={{ left: disp.hoja.x, top: disp.hoja.y, width: disp.hoja.w, height: disp.hoja.h }}
          />
        )}
        {!error && (!doc || !dibujada) && <div className={`cargando ${noche ? 'claro' : ''}`}>{doc ? 'Dibujando la página…' : 'Abriendo el libro…'}</div>}
      </div>

      {error && (
        <div className="lector-error">
          <p>{error}</p>
          <button className="btn-tinta" onClick={volver}>
            <Icono nombre="chevron-left" tam={16} /> Volver al estante
          </button>
        </div>
      )}

      <div className={`cromo-arriba ${cromo ? 'visible' : ''}`}>
        <button className="volver" onClick={volver}>
          <Icono nombre="chevron-left" tam={20} /> {desde === 'frases' ? 'Mis frases' : 'Estante'}
        </button>
        <div className="cromo-titulo">{libro?.titulo}</div>
      </div>

      <div className={`cromo-abajo ${cromo ? 'visible' : ''}`}>
        <span className="cromo-pag">{miles(mostrada + 1)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          step={1}
          value={mostrada}
          aria-label="Ir a la página"
          style={{ '--v': `${total > 1 ? (mostrada / (total - 1)) * 100 : 0}%` } as React.CSSProperties}
          onChange={(e) => setSaltoA(Number(e.target.value))}
          onPointerUp={() => {
            if (saltoA !== null) irA(saltoA);
            setSaltoA(null);
          }}
          onKeyUp={() => {
            if (saltoA !== null) irA(saltoA);
            setSaltoA(null);
          }}
        />
        <span className="cromo-pag">de {miles(total)}</span>
      </div>

      <AvisoModo />
      <AvisoBreve mensaje={mensaje} alCerrar={cerrarMensaje} />

      {doc && (
        <MenuEsquina alPapel={() => setPanel(true)} alFrases={() => verFrases(libroId)} alAbrir={() => setCromo(false)} />
      )}

      {panel && <PapelYSonido alCerrar={() => setPanel(false)} />}
    </div>
  );
}
