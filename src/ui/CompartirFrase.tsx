// Compartir una frase: la hoja con la vista previa, «Borrar palabras», la galería de marcos y dos
// botones. «Guardar imagen» la baja al teléfono; «Compartir» abre el menú del sistema (WhatsApp,
// Instagram…). Si el menú no se abre, aparece la imagen grande para guardarla o compartirla
// manteniendo el dedo encima. La hoja va directo en <body>: así no hereda los gestos del lector.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAjustes } from '../estado/ajustes';
import { useFrases } from '../estado/frases';
import { useLibros } from '../estado/libros';
import type { Frase } from '../frases/modelo';
import { cargarLetras, conPuntos, dibujarTarjeta, MARCOS, palabrasDe, type DatosTarjeta, type Marco } from '../frases/tarjeta';
import { Icono } from './Icono';

const NOMBRE = 'entre-hojas-frase.jpg';

/** El recorte de una página escaneada, como imagen para dibujar. */
async function imagenDe(blob: Blob | null | undefined): Promise<HTMLImageElement | null> {
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * La imagen del lienzo, al instante (sin esperar): el menú de compartir solo se abre si se pide en
 * el mismo toque, y en algunos teléfonos cualquier espera lo bloquea.
 */
function jpegYa(c: HTMLCanvasElement): { blob: Blob; url: string } {
  const url = c.toDataURL('image/jpeg', 0.92);
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: 'image/jpeg' }), url };
}

function bajar(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = NOMBRE;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** En el iPhone, con la app instalada, las descargas no funcionan: ahí se muestra la imagen. */
const sinDescargas = () => (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function CompartirFrase({ f: inicial, alCerrar }: { f: Frase; alCerrar: () => void }) {
  const f = useFrases((s) => s.frases.find((x) => x.id === inicial.id)) ?? inicial;
  const actualizar = useFrases((s) => s.actualizar);
  const libro = useLibros((s) => s.libros.find((l) => l.id === f.libroId));
  const [marco, setMarco] = useState<Marco>(() => useAjustes.getState().marco ?? 'clasico');
  const [base, setBase] = useState<Omit<DatosTarjeta, 'texto'> | null>(null);
  const [miniaturas, setMiniaturas] = useState<Partial<Record<Marco, string>>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  /** La imagen grande, para guardarla o compartirla con el dedo (si el menú no se abrió). */
  const [grande, setGrande] = useState<{ url: string; motivo: string } | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);

  // Borrar palabras: las palabras del texto como se capturó, y cuáles ya borré.
  const palabras = useMemo(() => palabrasDe(inicial.textoOriginal ?? inicial.texto), [inicial.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [borradas, setBorradas] = useState<Set<number>>(() => new Set(inicial.borradas ?? []));
  const [editando, setEditando] = useState(false);
  const texto = palabras.length ? conPuntos(palabras.filter((_, i) => !borradas.has(i)).join(' ')) : undefined;
  const datos = useMemo(() => (base ? { ...base, texto } : null), [base, texto]);

  // Las letras y, si la frase es de una página escaneada, su recorte.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [, img] = await Promise.all([cargarLetras(), imagenDe(f.imagen)]);
      if (vivo) setBase({ titulo: libro?.titulo ?? f.libroTitulo ?? 'Libro', imagen: img });
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id]);

  // La vista previa.
  useEffect(() => {
    const c = lienzo.current;
    if (c && datos) dibujarTarjeta(c, f, datos, marco);
  }, [datos, marco, f]);

  // Las miniaturas de la galería, de a una para no trabar la pantalla (y un rato después de
  // dejar de borrar palabras).
  useEffect(() => {
    if (!datos) return;
    let vivo = true;
    const grande = document.createElement('canvas');
    const chica = document.createElement('canvas');
    chica.width = 135;
    chica.height = 240;
    const pendientes = [...MARCOS];
    const siguiente = () => {
      const m = pendientes.shift();
      if (!m || !vivo) return;
      dibujarTarjeta(grande, f, datos, m.id);
      chica.getContext('2d')!.drawImage(grande, 0, 0, chica.width, chica.height);
      const url = chica.toDataURL('image/jpeg', 0.82);
      setMiniaturas((x) => ({ ...x, [m.id]: url }));
      setTimeout(siguiente, 16);
    };
    const t = setTimeout(siguiente, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [datos, f]);

  // Lo que borro queda también en Mis frases (un momento después de dejar de tocar).
  useEffect(() => {
    if (!palabras.length) return;
    const t = setTimeout(() => {
      const original = f.textoOriginal ?? f.texto;
      const lista = [...borradas].sort((a, b) => a - b);
      if (lista.join() === (f.borradas ?? []).join()) return;
      if (!lista.length) void actualizar(f.id, { texto: original, textoOriginal: undefined, borradas: undefined });
      else void actualizar(f.id, { texto: palabras.filter((_, i) => !borradas.has(i)).join(' '), textoOriginal: original, borradas: lista });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borradas]);

  // Tocar o arrastrar sobre las palabras: la primera decide si se borran o se recuperan.
  const gesto = useRef<{ borrar: boolean; vistas: Set<number> } | null>(null);
  const palabraEn = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-i]');
    return el ? Number(el.dataset.i) : -1;
  };
  const aplicar = (i: number) => {
    const g = gesto.current;
    if (!g || i < 0 || g.vistas.has(i)) return;
    g.vistas.add(i);
    setBorradas((b) => {
      const n = new Set(b);
      if (g.borrar) n.add(i);
      else n.delete(i);
      // Siempre queda al menos una palabra.
      return n.size >= palabras.length ? b : n;
    });
  };

  const elegir = (m: Marco) => {
    setMarco(m);
    useAjustes.getState().poner({ marco: m });
    setAviso(null);
  };

  const mostrarGrande = (motivo: string) => {
    const c = lienzo.current;
    if (c) setGrande({ url: jpegYa(c).url, motivo });
  };

  const guardar = () => {
    const c = lienzo.current;
    if (!c || !datos) return;
    if (sinDescargas()) return mostrarGrande('Mantén el dedo sobre la imagen y elige «Guardar en Fotos».');
    bajar(jpegYa(c).blob);
    setAviso('Imagen guardada en tus descargas.');
  };

  const compartir = () => {
    const c = lienzo.current;
    if (!c || !datos) return;
    const { blob } = jpegYa(c);
    const archivo = new File([blob], NOMBRE, { type: 'image/jpeg', lastModified: Date.now() });
    const puede = typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [archivo] }));
    if (!puede) return mostrarGrande('Este navegador no deja compartir imágenes directo.');
    navigator.share({ files: [archivo] }).then(
      () => setAviso(null),
      (e: Error) => {
        if (e.name !== 'AbortError') mostrarGrande(`No se abrió el menú de compartir (${e.name}).`);
      },
    );
  };

  return createPortal(
    <div className="velo velo-hoja velo-compartir" onClick={alCerrar}>
      <div className="ajustes compartir ui-claro" role="dialog" aria-label="Compartir frase" onClick={(e) => e.stopPropagation()}>
        <button className="asa" onClick={alCerrar} aria-label="Cerrar" />
        <h3>Compartir frase</h3>
        <div className="compartir-sub">Para tu estado o tus historias · 9:16</div>
        <div className="compartir-vista">
          <canvas ref={lienzo} aria-label={`Vista previa con el marco ${MARCOS.find((m) => m.id === marco)?.nombre}`} />
        </div>
        {palabras.length > 0 &&
          (editando ? (
            <div className="borrar-palabras">
              <p className="borrar-ayuda">
                <Icono nombre="eraser" tam={15} /> Toca o arrastra sobre las palabras que no quieras. Tócalas otra vez para recuperarlas.
              </p>
              <div
                className="palabras"
                onPointerDown={(e) => {
                  const i = palabraEn(e.clientX, e.clientY);
                  if (i < 0) return;
                  gesto.current = { borrar: !borradas.has(i), vistas: new Set() };
                  aplicar(i);
                }}
                onPointerMove={(e) => gesto.current && aplicar(palabraEn(e.clientX, e.clientY))}
                onPointerUp={() => (gesto.current = null)}
                onPointerCancel={() => (gesto.current = null)}
              >
                {palabras.map((p, i) => (
                  <span key={i}>
                    <span data-i={i} className={`palabra ${borradas.has(i) ? 'borrada' : ''}`}>
                      {p}
                    </span>{' '}
                  </span>
                ))}
              </div>
              <div className="borrar-botones">
                <button className="enlace-chico" onClick={() => setBorradas(new Set())} disabled={!borradas.size}>
                  <Icono nombre="undo-2" tam={14} /> Como estaba
                </button>
                <button className="enlace-chico" onClick={() => setEditando(false)}>
                  Listo
                </button>
              </div>
            </div>
          ) : (
            <button className="compartir-lapiz" onClick={() => setEditando(true)}>
              <Icono nombre="eraser" tam={14} /> Borrar palabras
            </button>
          ))}
        <div className="marcos" role="radiogroup" aria-label="Marco">
          {MARCOS.map((m) => (
            <button key={m.id} className={`marco ${marco === m.id ? 'sel' : ''}`} role="radio" aria-checked={marco === m.id} onClick={() => elegir(m.id)}>
              {miniaturas[m.id] ? <img src={miniaturas[m.id]} alt="" /> : <span className="marco-vacio" />}
              {m.nombre}
            </button>
          ))}
        </div>
        {aviso && (
          <p className="compartir-aviso" role="status">
            {aviso}
          </p>
        )}
        <div className="compartir-botones">
          <button className="guardar" onClick={guardar} disabled={!datos}>
            <Icono nombre="download" tam={18} /> Guardar imagen
          </button>
          <button className="btn-tinta" onClick={compartir} disabled={!datos}>
            <Icono nombre="share" tam={18} /> Compartir
          </button>
        </div>
      </div>
      {grande && (
        <div className="imagen-grande" role="dialog" aria-label="Imagen para guardar o compartir" onClick={(e) => e.stopPropagation()}>
          <p>{grande.motivo}</p>
          <img src={grande.url} alt="La frase con su marco" />
          <p className="imagen-grande-ayuda">Mantén el dedo sobre la imagen para guardarla o compartirla.</p>
          <button className="btn-tinta claro" onClick={() => setGrande(null)}>
            Cerrar
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
