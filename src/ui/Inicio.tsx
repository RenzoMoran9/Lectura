// Estante (propuesta visual, pantalla 1): «Seguir leyendo», «Para recordar hoy», los libros con su
// portada y su avance, «Subir PDF» y las pestañas «Estante» y «Mis frases».

import { useMemo, useRef, useState } from 'react';
import type { Libro } from '../datos/bd';
import { useAjustes } from '../estado/ajustes';
import { useFrases } from '../estado/frases';
import { useLibros } from '../estado/libros';
import { azar } from '../frases/dibujo';
import { delDia as repasoDeHoy, diaDe } from '../frases/repaso';
import { tiempoLegible } from '../lectura/lugar';
import { usePwa } from '../pwa/pwa';
import { sonido } from '../sonido/sonido';
import { FichaLibro } from './FichaLibro';
import { miles, tamanoLegible } from './formato';
import { Icono } from './Icono';
import { TextoFrase } from './MisFrases';
import { Pestanas } from './Pestanas';
import { Portada } from './Portada';
import { RepasoDiario } from './RepasoDiario';

const saludo = () => {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
};

const sinAcentos = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Cada día toca una frase distinta, la misma todo el día. */
function fraseDelDia<T extends { id: string }>(frases: T[]): T | undefined {
  if (!frases.length) return undefined;
  const hoy = new Date().toLocaleDateString('en-CA');
  const orden = [...frases].sort((a, b) => (a.id < b.id ? -1 : 1));
  return orden[Math.floor(azar(hoy)() * orden.length)];
}

function InstalarAviso() {
  const { evento, instalada, ios, instalar } = usePwa();
  const { sinAvisoInstalar, poner } = useAjustes();
  if (instalada || sinAvisoInstalar || (!evento && !ios)) return null;
  return (
    <div className="aviso-instalar">
      <Icono nombre="download" tam={18} />
      {evento ? (
        <>
          <span>Instálala en tu pantalla de inicio: se abre a pantalla completa y funciona sin internet.</span>
          <button className="btn-tinta" onClick={instalar}>
            Instalar
          </button>
        </>
      ) : (
        <span>
          Para instalarla, toca <b>Compartir</b> <span className="ios-compartir" aria-hidden="true">⎋</span> y luego <b>Agregar a inicio</b>.
        </span>
      )}
      <button className="cerrar-aviso" onClick={() => poner({ sinAvisoInstalar: true })} aria-label="No volver a mostrar">
        <Icono nombre="x" tam={16} />
      </button>
    </div>
  );
}

export function Inicio() {
  const { libros, avances, subida, error, subir, abrir: abrirLibro, limpiarError, cargado } = useLibros();
  const frases = useFrases((s) => s.frases);
  // Abrir un libro es un toque del usuario: se aprovecha para encender el audio de las hojas.
  const abrir = (id: string, pagina?: number) => {
    sonido.despertar();
    abrirLibro(id, pagina);
  };
  const entrada = useRef<HTMLInputElement>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [cargandoMuestra, setCargandoMuestra] = useState(false);

  const ordenados = useMemo(
    () => [...libros].sort((a, b) => (avances[b.id]?.actualizado ?? b.agregado) - (avances[a.id]?.actualizado ?? a.agregado)),
    [libros, avances],
  );
  // «Seguir leyendo» es el último libro que se abrió (no uno recién subido sin leer).
  const ultimo = ordenados.find((l) => avances[l.id]) ?? ordenados[0];
  const q = sinAcentos(busqueda.trim());
  const visibles = q ? ordenados.filter((l) => sinAcentos(`${l.titulo} ${l.autor}`).includes(q)) : ordenados;

  const delDia = useMemo(() => fraseDelDia(frases.filter((f) => f.texto || f.imagen)), [frases]);
  // El repaso del día: las frases que tocan hoy (se calcula al entrar al estante).
  const tocanHoy = useMemo(() => repasoDeHoy(frases, Date.now()), [frases]);
  const [repasoAbierto, setRepasoAbierto] = useState(false);
  const racha = useAjustes((s) => s.racha);
  const libroDelDia = delDia && libros.find((l) => l.id === delDia.libroId);

  const elegir = () => entrada.current?.click();
  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (archivo) void subir(archivo);
  };

  const probarMuestra = async () => {
    setCargandoMuestra(true);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}muestra/don-quijote-capitulo-1.pdf`);
      const blob = await r.blob();
      await subir(new File([blob], 'Don Quijote de la Mancha (muestra).pdf', { type: 'application/pdf' }));
    } finally {
      setCargandoMuestra(false);
    }
  };

  const pct = (l: Libro) => {
    const a = avances[l.id];
    return a && a.total > 1 ? Math.round((a.pagina / (a.total - 1)) * 100) : 0;
  };
  const estadoLibro = (l: Libro) => {
    const a = avances[l.id];
    if (!a) return 'Nuevo';
    if (a.total > 1 && a.pagina >= a.total - 1) return 'Leído ✓';
    return `${Math.max(1, pct(l))} %`;
  };
  const avanceUltimo = ultimo && avances[ultimo.id];
  const libroFicha = ficha ? libros.find((l) => l.id === ficha) : undefined;

  return (
    <div className="inicio ui">
      <div className="inicio-cont">
        <div className="saludo">{saludo()}</div>
        <div className="titulo-fila">
          <h1 className="titulo-app">Mi estante</h1>
          {libros.length > 0 && (
            <button
              className={`icono-btn ${buscando ? 'on' : ''}`}
              onClick={() => {
                setBuscando((b) => !b);
                setBusqueda('');
              }}
              aria-label={buscando ? 'Cerrar búsqueda' : 'Buscar en el estante'}
            >
              <Icono nombre={buscando ? 'x' : 'search'} tam={19} />
            </button>
          )}
        </div>

        {buscando && (
          <label className="buscar buscar-estante">
            <Icono nombre="search" tam={18} />
            <input type="search" autoFocus placeholder="Buscar por título o autor" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </label>
        )}

        {!buscando && <InstalarAviso />}

        {cargado && !ultimo && !subida && (
          <div className="vacio">
            <p className="vacio-t">Tu estante está vacío</p>
            <p className="vacio-p">Sube un libro en PDF, del tamaño que sea, y léelo pasando las hojas con el dedo, como si fuera de papel.</p>
            <button className="btn-tinta" onClick={elegir}>
              <Icono nombre="upload" tam={17} /> Subir PDF
            </button>
            <button className="enlace" onClick={probarMuestra} disabled={cargandoMuestra}>
              {cargandoMuestra ? 'Abriendo…' : 'o prueba con un libro de muestra'}
            </button>
          </div>
        )}

        {ultimo && !buscando && (
          <div className="seguir papel-crema" role="button" tabIndex={0} onClick={() => abrir(ultimo.id)} onKeyDown={(e) => e.key === 'Enter' && abrir(ultimo.id)}>
            <div className="cinta" aria-hidden="true" />
            <Portada libro={ultimo} grande />
            <div className="seguir-datos">
              <div className="eti">{avanceUltimo ? 'Seguir leyendo' : 'Empezar a leer'}</div>
              <div className="libro-t">{ultimo.titulo}</div>
              {ultimo.autor && <div className="libro-a">{ultimo.autor}</div>}
              <div className="avance">
                <span style={{ width: `${Math.max(2, pct(ultimo))}%` }} />
              </div>
              <div className="avance-t">
                {avanceUltimo?.capitulo && <span className="cap-actual">{avanceUltimo.capitulo} · </span>}
                pág. {miles((avanceUltimo?.pagina ?? 0) + 1)} de {miles(ultimo.paginas)}
                {avanceUltimo?.falta && (
                  <span className="falta-t">
                    {avanceUltimo.falta.capitulo != null
                      ? `${tiempoLegible(avanceUltimo.falta.capitulo)} para terminar el capítulo`
                      : `${tiempoLegible(avanceUltimo.falta.libro)} para terminar el libro`}
                  </span>
                )}
              </div>
              {ultimo.marcador?.texto && ultimo.marcador.pagina === avanceUltimo?.pagina && <div className="marca-texto">«…{ultimo.marcador.texto}…»</div>}
              <button className="btn-tinta">
                {avanceUltimo ? 'Continuar' : 'Abrir'} <Icono nombre="arrow-right" tam={16} />
              </button>
            </div>
          </div>
        )}

        {delDia && !buscando && (
          <div
            className="recordar"
            role="button"
            tabIndex={0}
            onClick={() => libroDelDia && abrir(delDia.libroId, delDia.pagina)}
            onKeyDown={(e) => e.key === 'Enter' && libroDelDia && abrir(delDia.libroId, delDia.pagina)}
          >
            <div className="eti">
              <Icono nombre="sparkles" tam={14} /> Para recordar hoy
            </div>
            <p className="frase">
              <TextoFrase f={delDia} />
            </p>
            <div className="meta">
              {[libroDelDia?.titulo ?? delDia.libroTitulo, libroDelDia?.autor, `pág. ${delDia.pagina + 1}`].filter(Boolean).join(' · ')}
            </div>
            {tocanHoy.length > 0 ? (
              <div className="recordar-cta">
                <span>
                  {tocanHoy.length} {tocanHoy.length === 1 ? 'frase para repasar hoy' : 'frases para repasar hoy'}
                </span>
                <button
                  className="btn-tinta"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRepasoAbierto(true);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  Repasar <Icono nombre="arrow-right" tam={14} />
                </button>
              </div>
            ) : (
              racha?.dia === diaDe(Date.now()) && (
                <div className="recordar-cta listo">
                  <span>
                    Repaso de hoy listo <Icono nombre="check" tam={13} grosor={2.6} />
                    {racha.dias > 1 ? ` · ${racha.dias} días seguidos` : ''}
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {ordenados.length > 0 && (
          <>
            <div className="titulo-sec">
              <b>{q ? 'Resultados' : 'Mis libros'}</b>
              <span>
                {visibles.length} {visibles.length === 1 ? 'libro' : 'libros'}
                {q ? '' : ' · recientes'}
              </span>
            </div>
            {visibles.length === 0 && <p className="nada">Ningún libro coincide.</p>}
            <div className="rejilla">
              {visibles.map((l) => (
                <div key={l.id} className="libro-celda">
                  <button className="libro-boton" onClick={() => abrir(l.id)} aria-label={`Abrir ${l.titulo}`}>
                    <Portada libro={l} />
                  </button>
                  <div className="mini-av">
                    <span style={{ width: `${pct(l)}%` }} />
                  </div>
                  <div className="lib-fila">
                    <div className="lib-textos">
                      <div className="lib-t" title={l.titulo}>
                        {l.titulo}
                      </div>
                      <div className="lib-m">
                        {estadoLibro(l)} · {tamanoLegible(l.tamano)}
                      </div>
                    </div>
                    <button className="mas" onClick={() => setFicha(l.id)} aria-label={`Portada y datos de ${l.titulo}`}>
                      <Icono nombre="more-horizontal" tam={18} grosor={2.4} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {(ordenados.length > 0 || subida) && (
        <button className="subir con-pestanas" onClick={elegir} disabled={!!subida}>
          <Icono nombre="plus" tam={20} grosor={2.2} /> Subir PDF
        </button>
      )}

      <Pestanas actual="inicio" />

      <input ref={entrada} type="file" accept="application/pdf,.pdf" hidden onChange={alElegir} />

      {repasoAbierto && (
        <RepasoDiario
          frases={tocanHoy}
          alCerrar={() => setRepasoAbierto(false)}
          alIr={(f) => {
            setRepasoAbierto(false);
            abrir(f.libroId, f.pagina);
          }}
        />
      )}
      {libroFicha && <FichaLibro key={libroFicha.id} libro={libroFicha} alCerrar={() => setFicha(null)} />}

      {subida && (
        <div className="velo">
          <div className="dialogo" role="status">
            <div className="eti">{subida.fase === 'leyendo' ? 'Abriendo' : 'Guardando en tu estante'}</div>
            <div className="dialogo-t">{subida.nombre.replace(/\.pdf$/i, '')}</div>
            <div className="avance ancho">
              <span
                className={subida.fase === 'leyendo' ? 'indeterminado' : ''}
                style={{ width: subida.fase === 'leyendo' ? '30%' : `${Math.round((subida.escritos / Math.max(1, subida.tamano)) * 100)}%` }}
              />
            </div>
            <div className="avance-t">
              {subida.fase === 'guardando' ? `${tamanoLegible(subida.escritos)} de ${tamanoLegible(subida.tamano)}` : tamanoLegible(subida.tamano)} · se guarda tal cual
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="aviso-error" role="alert" onClick={limpiarError}>
          {error}
          <Icono nombre="x" tam={16} />
        </div>
      )}
    </div>
  );
}
