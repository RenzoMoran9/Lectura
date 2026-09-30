// Ficha de un libro (el «⋯» del estante): título, autor y portada. La portada puede ser la primera
// página del PDF, la original buscada en internet (Open Library y Google Books) o una «de tela»
// hecha por la app. También se quita el libro del estante desde aquí.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Libro } from '../datos/bd';
import { useAjustes } from '../estado/ajustes';
import { useLibros } from '../estado/libros';
import { buscarPortadas, coincide, limpiarTitulo, traerPortada, type Candidata } from '../portadas/buscar';
import { ESTILOS_TELA, portadaDeTela } from '../portadas/tela';
import { Icono } from './Icono';
import { tamanoLegible } from './formato';
import { useUrlDeBlob } from './Portada';

type Opcion = 'pdf' | `tela-${number}` | `url:${string}`;

type Busqueda = { estado: 'buscando' } | { estado: 'listo'; candidatas: Candidata[] } | { estado: 'sin-conexion' };

function opcionActual(l: Libro): Opcion {
  if (l.portadaOrigen === 'internet' && l.portadaUrl) return `url:${l.portadaUrl}`;
  if (l.portadaOrigen === 'tela') return `tela-${l.portadaTela ?? 0}`;
  return 'pdf';
}

function Muestra({
  on,
  alElegir,
  children,
  pie,
  etiqueta,
}: {
  on: boolean;
  alElegir: () => void;
  children: React.ReactNode;
  pie: React.ReactNode;
  etiqueta: string;
}) {
  return (
    <button className={`opcion-portada ${on ? 'on' : ''}`} onClick={alElegir} aria-pressed={on} aria-label={etiqueta}>
      <span className="portada">
        {children}
        {on && (
          <span className="ok">
            <Icono nombre="check" tam={14} grosor={3} />
          </span>
        )}
      </span>
      <span className="opcion-pie">{pie}</span>
    </button>
  );
}

type Opcional = Candidata & { enUso?: boolean };

function ImagenEnLinea({ c, on, alElegir, guardada }: { c: Opcional; on: boolean; alElegir: () => void; guardada?: string | null }) {
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'rota'>('cargando');
  if (estado === 'rota') return null;
  const pie = c.enUso ? (
    'En uso'
  ) : (
    <>
      {c.fuente}
      {c.anio && <small>{c.anio}</small>}
    </>
  );
  return (
    <Muestra on={on} alElegir={alElegir} etiqueta={c.enUso ? 'Portada de internet en uso' : `Portada de ${c.fuente}: ${c.titulo}`} pie={pie}>
      <img
        src={guardada ?? c.url}
        alt=""
        draggable={false}
        className={estado === 'cargando' ? 'cargando' : ''}
        onLoad={(e) => setEstado(e.currentTarget.naturalWidth > 20 ? 'lista' : 'rota')}
        onError={() => setEstado('rota')}
      />
    </Muestra>
  );
}

export function FichaLibro({ libro, alCerrar }: { libro: Libro; alCerrar: () => void }) {
  const { actualizar, quitar } = useLibros();
  const { portadasEnLinea, poner } = useAjustes();
  const [titulo, setTitulo] = useState(libro.titulo);
  const [autor, setAutor] = useState(libro.autor);
  const [elegida, setElegida] = useState<Opcion>(opcionActual(libro));
  const [busqueda, setBusqueda] = useState<Busqueda>({ estado: 'buscando' });
  const [telas, setTelas] = useState<(string | null)[]>(ESTILOS_TELA.map(() => null));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const control = useRef<AbortController | null>(null);

  const pdf = useUrlDeBlob(libro.portadaPdf ?? ((libro.portadaOrigen ?? 'pdf') === 'pdf' ? libro.portada : null));
  const actualEnLinea = useUrlDeBlob(libro.portadaOrigen === 'internet' ? libro.portada : null);

  const buscar = (t = titulo, a = autor) => {
    control.current?.abort();
    const c = (control.current = new AbortController());
    setBusqueda({ estado: 'buscando' });
    buscarPortadas(t, a, c.signal)
      .then((candidatas) => !c.signal.aborted && setBusqueda({ estado: 'listo', candidatas }))
      .catch(() => !c.signal.aborted && setBusqueda({ estado: 'sin-conexion' }));
  };

  useEffect(() => {
    if (navigator.onLine) buscar();
    else setBusqueda({ estado: 'sin-conexion' });
    return () => control.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Las portadas de tela se dibujan con el título y el autor escritos (al dejar de escribir).
  useEffect(() => {
    let vivo = true;
    const urls: string[] = [];
    const t = setTimeout(async () => {
      const blobs = await Promise.all(ESTILOS_TELA.map((_, i) => portadaDeTela(titulo || 'Sin título', autor, i)));
      if (!vivo) return;
      blobs.forEach((b) => urls.push(URL.createObjectURL(b)));
      setTelas(urls);
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [titulo, autor]);

  // La portada de internet en uso va primero, aunque la nueva búsqueda no la traiga.
  const candidatas = useMemo((): Opcional[] => {
    const lista = busqueda.estado === 'listo' ? busqueda.candidatas : [];
    if (libro.portadaOrigen !== 'internet' || !libro.portadaUrl || lista.some((c) => c.url === libro.portadaUrl)) return lista;
    return [{ url: libro.portadaUrl, fuente: 'Open Library' as const, titulo: libro.titulo, autor: libro.autor, enUso: true }, ...lista];
  }, [busqueda, libro]);

  const limpio = limpiarTitulo(titulo);
  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const cambios: Partial<Libro> = { titulo: titulo.trim() || libro.titulo, autor: autor.trim(), portadaBuscada: true };
      const pdfBlob = libro.portadaPdf ?? ((libro.portadaOrigen ?? 'pdf') === 'pdf' ? libro.portada : null) ?? null;
      const cambioTexto = cambios.titulo !== libro.titulo || cambios.autor !== libro.autor;
      if (elegida === 'pdf') {
        Object.assign(cambios, { portada: pdfBlob, portadaPdf: pdfBlob, portadaUrl: undefined, portadaOrigen: 'pdf' } satisfies Partial<Libro>);
      } else if (elegida.startsWith('tela-')) {
        const n = Number(elegida.slice(5));
        if (elegida !== opcionActual(libro) || cambioTexto) {
          const blob = await portadaDeTela(cambios.titulo!, cambios.autor!, n);
          Object.assign(cambios, { portada: blob, portadaPdf: pdfBlob, portadaUrl: undefined, portadaOrigen: 'tela', portadaTela: n } satisfies Partial<Libro>);
        }
      } else if (elegida !== opcionActual(libro)) {
        const url = elegida.slice(4);
        const traida = await traerPortada(url);
        if (!traida) {
          setError('No se pudo descargar esa portada. Revisa la conexión o elige otra.');
          return;
        }
        Object.assign(cambios, { portada: traida.blob ?? null, portadaPdf: pdfBlob, portadaUrl: url, portadaOrigen: 'internet' } satisfies Partial<Libro>);
      }
      await actualizar(libro.id, cambios);
      alCerrar();
    } finally {
      setGuardando(false);
    }
  };

  const pedirQuitar = async () => {
    if (!confirm(`¿Quitar «${libro.titulo}» de tu estante? Se borra de este dispositivo. Tus frases se conservan.`)) return;
    await quitar(libro);
    alCerrar();
  };

  return (
    <div className="velo velo-hoja" onClick={alCerrar}>
      <div className="ajustes ficha ui-claro" role="dialog" aria-label="Ficha del libro" onClick={(e) => e.stopPropagation()}>
        <button className="asa" onClick={alCerrar} aria-label="Cerrar" />
        <h3>Ficha del libro</h3>

        <div className="campos">
          <label className="campo">
            <span>Título</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} enterKeyHint="search" onKeyDown={(e) => e.key === 'Enter' && buscar()} />
          </label>
          <label className="campo">
            <span>Autor</span>
            <input value={autor} placeholder="Opcional" onChange={(e) => setAutor(e.target.value)} enterKeyHint="search" onKeyDown={(e) => e.key === 'Enter' && buscar()} />
          </label>
        </div>

        <div className="eti-sec fila-eti">
          <span>Portada</span>
          <button className="enlace-chico" onClick={() => buscar()} disabled={busqueda.estado === 'buscando' || !limpio}>
            <Icono nombre="search" tam={14} /> Buscar en internet
          </button>
        </div>
        <div className="opciones-portada">
          <Muestra on={elegida === 'pdf'} alElegir={() => setElegida('pdf')} etiqueta="Primera página del PDF" pie="Del PDF">
            {pdf ? <img src={pdf} alt="" draggable={false} /> : <span className="portada-t">{titulo}</span>}
          </Muestra>

          {candidatas.map((c) => (
            <ImagenEnLinea
              key={c.url}
              c={c}
              guardada={c.enUso ? actualEnLinea : null}
              on={elegida === `url:${c.url}`}
              alElegir={() => setElegida(`url:${c.url}`)}
            />
          ))}
          {busqueda.estado === 'buscando' &&
            [0, 1, 2].map((i) => (
              <div key={i} className="opcion-portada" aria-hidden="true">
                <span className="portada esperando" />
                <span className="opcion-pie">&nbsp;</span>
              </div>
            ))}

          {ESTILOS_TELA.map((e, i) => (
            <Muestra key={e.nombre} on={elegida === `tela-${i}`} alElegir={() => setElegida(`tela-${i}`)} etiqueta={`Portada de tela ${e.nombre}`} pie={`Tela ${e.nombre.toLowerCase()}`}>
              {telas[i] ? <img src={telas[i]!} alt="" draggable={false} /> : <span className="tela-vacia" style={{ background: e.fondo }} />}
            </Muestra>
          ))}
        </div>

        {busqueda.estado === 'sin-conexion' && <p className="nota">Sin conexión: conéctate a internet para buscar la portada original.</p>}
        {busqueda.estado === 'listo' && candidatas.length === 0 && (
          <p className="nota">No se encontró su portada en internet. Prueba corrigiendo el título o el autor, y toca «Buscar en internet».</p>
        )}
        {busqueda.estado === 'listo' && candidatas.length > 0 && !candidatas.some((c) => coincide(c, limpio, autor)) && (
          <p className="nota">Ninguna coincide del todo con el título: revisa que sea la de tu libro.</p>
        )}
        {error && <p className="nota error">{error}</p>}

        <label className="fila-aj auto-portadas">
          <Icono nombre="sparkles" tam={18} />
          <span>Buscar sola la portada de los libros nuevos</span>
          <input type="checkbox" role="switch" className="switch" checked={portadasEnLinea} onChange={(e) => poner({ portadasEnLinea: e.target.checked })} />
        </label>

        <div className="ficha-pie">
          <button className="quitar-libro" onClick={pedirQuitar}>
            <Icono nombre="trash" tam={16} /> Quitar del estante
          </button>
          <span className="ficha-datos">
            {libro.paginas.toLocaleString('es')} pág. · {tamanoLegible(libro.tamano)}
          </span>
          <button className="btn-tinta" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
