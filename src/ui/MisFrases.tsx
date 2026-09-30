// Mis frases: todo lo resaltado o encerrado, agrupado por libro, con buscador, filtros por libro y
// por color, «Ir a la página» y «Repasar» (frases al azar para hacer memoria).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrases } from '../estado/frases';
import { useLibros } from '../estado/libros';
import { colorCss, lazoAlrededor } from '../frases/dibujo';
import { COLORES_LAPIZ, COLORES_RESALTADOR, esLapiz, LAPICES, rgbDe, type ColorMarca, type Frase } from '../frases/modelo';
import { Icono } from './Icono';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function cuando(t: number): string {
  const dia = 864e5;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy.getTime() - d.getTime()) / dia);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 14) return 'la semana pasada';
  return new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short', year: dias > 300 ? 'numeric' : undefined });
}

/** Imagen guardada (páginas escaneadas). */
function Recorte({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img className="recorte" src={url} alt="Recorte de la página" /> : null;
}

/** Texto encerrado a lápiz: el contorno se genera a mano alrededor de los renglones que ocupa. */
function Encerrado({ texto, color, semilla }: { texto: string; color: ColorMarca; semilla: string }) {
  const caja = useRef<HTMLSpanElement>(null);
  const span = useRef<HTMLSpanElement>(null);
  const [d, setD] = useState('');
  useLayoutEffect(() => {
    const medir = () => {
      const c = caja.current?.getBoundingClientRect();
      if (!c || !span.current) return;
      const lineas: { l: number; r: number; t: number; b: number }[] = [];
      [...span.current.getClientRects()].forEach((r) => {
        const l = { l: r.left - c.left, r: r.right - c.left, t: r.top - c.top, b: r.bottom - c.top };
        const ya = lineas.find((x) => Math.abs(x.t - l.t) < 4);
        if (ya) {
          ya.l = Math.min(ya.l, l.l);
          ya.r = Math.max(ya.r, l.r);
          ya.b = Math.max(ya.b, l.b);
        } else lineas.push(l);
      });
      lineas.sort((p, q) => p.t - q.t);
      setD(lazoAlrededor(lineas, semilla));
    };
    medir();
    const obs = new ResizeObserver(medir);
    if (caja.current) obs.observe(caja.current);
    return () => obs.disconnect();
  }, [texto, semilla]);
  const hex = esLapiz(color) ? LAPICES[color].hex : LAPICES.grafito.hex;
  return (
    <span className="encerrado" ref={caja}>
      <span ref={span}>{texto}</span>
      <svg className="lazo" aria-hidden="true">
        <path d={d} fill="none" stroke={hex} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" opacity=".82" />
        <path d={d} fill="none" stroke={hex} strokeWidth=".8" strokeLinecap="round" opacity=".35" transform="translate(.8 .7)" />
      </svg>
    </span>
  );
}

export function TextoFrase({ f }: { f: Frase }) {
  if (!f.texto && f.imagen) return <Recorte blob={f.imagen} />;
  if (!f.texto) return <span className="sin-texto">(marca sin texto)</span>;
  if (f.tipo === 'encerrado') return <Encerrado texto={f.texto} color={f.color} semilla={f.id} />;
  return (
    <span className="hl" style={{ '--c': rgbDe(f.color) } as React.CSSProperties}>
      {f.texto}
    </span>
  );
}

function Repasar({ frases, alCerrar, alIr }: { frases: Frase[]; alCerrar: () => void; alIr: (f: Frase) => void }) {
  const barajar = () => [...frases].sort(() => Math.random() - 0.5);
  const [mazo, setMazo] = useState(barajar);
  const [i, setI] = useState(0);
  const f = mazo[i];
  const libros = useLibros((s) => s.libros);
  if (!f) return null;
  const titulo = libros.find((l) => l.id === f.libroId)?.titulo ?? f.libroTitulo ?? 'Libro';
  const otra = () => {
    if (i + 1 < mazo.length) setI(i + 1);
    else {
      setMazo(barajar());
      setI(0);
    }
  };
  return (
    <div className="repasar-velo" role="dialog" aria-label="Repasar frases">
      <button className="repasar-cerrar" onClick={alCerrar} aria-label="Cerrar">
        <Icono nombre="x" tam={22} />
      </button>
      <div className="repasar-cont">
        <div className="eti">Para recordar</div>
        <article key={f.id} className="repasar-tarjeta papel-crema">
          <p className="q">
            <TextoFrase f={f} />
          </p>
          <div className="repasar-meta">
            {titulo} · pág. {f.pagina + 1} · {cuando(f.creada)}
          </div>
        </article>
        <div className="repasar-botones">
          <button className="btn-tinta" onClick={otra}>
            <Icono nombre="shuffle" tam={16} /> Otra frase
          </button>
          {libros.some((l) => l.id === f.libroId) && (
            <button className="enlace-ir" onClick={() => alIr(f)}>
              Ir a la página <Icono nombre="arrow-right" tam={15} />
            </button>
          )}
        </div>
        <div className="repasar-cuenta">
          {i + 1} de {mazo.length}
        </div>
      </div>
    </div>
  );
}

export function MisFrases({ libroId }: { libroId?: string }) {
  const frases = useFrases((s) => s.frases);
  const { libros, volver, abrir } = useLibros();
  const [busqueda, setBusqueda] = useState('');
  const [filtroLibro, setFiltroLibro] = useState<string | null>(libroId ?? null);
  const [filtroColor, setFiltroColor] = useState<ColorMarca | null>(null);
  const [verColores, setVerColores] = useState(false);
  const [repasando, setRepasando] = useState(false);

  const tituloDe = (id: string, f?: Frase) => libros.find((l) => l.id === id)?.titulo ?? f?.libroTitulo ?? 'Libro';
  const enEstante = (id: string) => libros.some((l) => l.id === id);

  const librosConFrases = useMemo(() => {
    const m = new Map<string, { id: string; titulo: string; ultima: number }>();
    for (const f of frases) {
      const x = m.get(f.libroId);
      if (!x) m.set(f.libroId, { id: f.libroId, titulo: tituloDe(f.libroId, f), ultima: f.creada });
      else x.ultima = Math.max(x.ultima, f.creada);
    }
    return [...m.values()].sort((a, b) => b.ultima - a.ultima);
  }, [frases, libros]);

  const filtradas = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    return frases.filter(
      (f) =>
        (!filtroLibro || f.libroId === filtroLibro) &&
        (!filtroColor || f.color === filtroColor) &&
        (!q || sinAcentos(f.texto).includes(q) || sinAcentos(tituloDe(f.libroId, f)).includes(q)),
    );
  }, [frases, filtroLibro, filtroColor, busqueda, libros]);

  const grupos = librosConFrases
    .map((l) => ({ ...l, frases: filtradas.filter((f) => f.libroId === l.id).sort((a, b) => a.pagina - b.pagina || a.creada - b.creada) }))
    .filter((g) => g.frases.length);

  const ir = (f: Frase) => enEstante(f.libroId) && abrir(f.libroId, f.pagina);
  const coloresUsados = [...COLORES_RESALTADOR, ...COLORES_LAPIZ].filter((c) => frases.some((f) => f.color === c));

  return (
    <div className="mis-frases ui">
      <div className="inicio-cont">
        <button className="volver" onClick={volver}>
          <Icono nombre="chevron-left" tam={20} /> Volver
        </button>
        <div className="titulo-fila">
          <h1 className="titulo-app">Mis frases</h1>
          {filtradas.length > 0 && (
            <button className="repasar" onClick={() => setRepasando(true)}>
              <Icono nombre="shuffle" tam={16} /> Repasar
            </button>
          )}
        </div>
        <div className="sub">
          {frases.length} {frases.length === 1 ? 'frase' : 'frases'} · {librosConFrases.length} {librosConFrases.length === 1 ? 'libro' : 'libros'}
        </div>

        {frases.length === 0 ? (
          <div className="vacio">
            <p className="vacio-t">Aún no tienes frases</p>
            <p className="vacio-p">
              Abre un libro, toca el botón de la esquina y elige el resaltador o el lápiz. Lo que marques se guarda aquí solo.
            </p>
          </div>
        ) : (
          <>
            <label className="buscar">
              <Icono nombre="search" tam={18} />
              <input type="search" placeholder="Buscar en tus frases" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </label>
            <div className="chips">
              <button className={!filtroLibro && !filtroColor ? 'on' : ''} onClick={() => (setFiltroLibro(null), setFiltroColor(null))}>
                Todas
              </button>
              {librosConFrases.map((l) => (
                <button key={l.id} className={filtroLibro === l.id ? 'on' : ''} onClick={() => setFiltroLibro(filtroLibro === l.id ? null : l.id)}>
                  {l.titulo.length > 22 ? l.titulo.slice(0, 20).trimEnd() + '…' : l.titulo}
                </button>
              ))}
              <button className={`chip-colores ${filtroColor || verColores ? 'on' : ''}`} onClick={() => setVerColores((v) => !v)} aria-label="Filtrar por color">
                {(filtroColor ? [filtroColor] : coloresUsados.slice(0, 3)).map((c) => (
                  <i key={c} className="pto" style={{ background: colorCss(c) }} />
                ))}
              </button>
            </div>
            {verColores && (
              <div className="colores-filtro">
                {coloresUsados.map((c) => (
                  <button
                    key={c}
                    className={filtroColor === c ? 'sel' : ''}
                    style={{ background: colorCss(c) }}
                    aria-label={c}
                    onClick={() => setFiltroColor(filtroColor === c ? null : c)}
                  />
                ))}
              </div>
            )}

            {grupos.length === 0 && <p className="nada">Ninguna frase coincide.</p>}
            {grupos.map((g) => (
              <section key={g.id}>
                <div className="grupo">{g.titulo}</div>
                {g.frases.map((f) => (
                  <article key={f.id} className="tarjeta" onClick={() => ir(f)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && ir(f)}>
                    <p className="q">
                      <TextoFrase f={f} />
                    </p>
                    <div className="meta">
                      <span>
                        Pág. {f.pagina + 1} · {cuando(f.creada)}
                      </span>
                      {enEstante(f.libroId) ? (
                        <span className="ir">
                          Ir a la página <Icono nombre="arrow-right" tam={14} />
                        </span>
                      ) : (
                        <span className="fuera">El libro ya no está en el estante</span>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </>
        )}
      </div>
      {repasando && <Repasar frases={filtradas} alCerrar={() => setRepasando(false)} alIr={ir} />}
    </div>
  );
}
