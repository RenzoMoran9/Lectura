// Pantalla de inicio (Etapa 1): seguir leyendo, los libros guardados y «Subir PDF».
// El estante completo, con pestañas y «Para recordar hoy», llega en la Etapa 3.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Libro } from '../datos/bd';
import { useLibros } from '../estado/libros';
import { sonido } from '../sonido/sonido';
import { Icono } from './Icono';

const saludo = () => {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
};

export const tamanoLegible = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

const miles = (n: number) => n.toLocaleString('es');

function Portada({ libro, grande }: { libro: Libro; grande?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!libro.portada) return;
    const u = URL.createObjectURL(libro.portada);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [libro.portada]);
  return (
    <div className={`portada ${grande ? 'grande' : ''}`}>
      {url ? <img src={url} alt="" draggable={false} /> : <span className="portada-t">{libro.titulo}</span>}
    </div>
  );
}

export function Inicio() {
  const { libros, avances, subida, error, subir, abrir: abrirLibro, quitar, limpiarError, cargado } = useLibros();
  // Abrir un libro es un toque del usuario: se aprovecha para encender el audio de las hojas.
  const abrir = (id: string) => {
    sonido.despertar();
    abrirLibro(id);
  };
  const entrada = useRef<HTMLInputElement>(null);
  const [quitando, setQuitando] = useState(false);
  const [cargandoMuestra, setCargandoMuestra] = useState(false);

  const ordenados = useMemo(
    () =>
      [...libros].sort(
        (a, b) => (avances[b.id]?.actualizado ?? b.agregado) - (avances[a.id]?.actualizado ?? a.agregado),
      ),
    [libros, avances],
  );
  const ultimo = ordenados[0];

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

  const pedirQuitar = (libro: Libro) => {
    if (confirm(`¿Quitar «${libro.titulo}» de tu estante? Se borra de este dispositivo.`)) void quitar(libro);
  };

  const pct = (l: Libro) => {
    const a = avances[l.id];
    return a && a.total > 1 ? Math.round((a.pagina / (a.total - 1)) * 100) : 0;
  };

  return (
    <div className="inicio ui">
      <div className="inicio-cont">
        <div className="saludo">{saludo()}</div>
        <h1 className="titulo-app">Mi estante</h1>

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

        {ultimo && (
          <div className="seguir papel-crema" role="button" tabIndex={0} onClick={() => abrir(ultimo.id)} onKeyDown={(e) => e.key === 'Enter' && abrir(ultimo.id)}>
            <div className="cinta" aria-hidden="true" />
            <Portada libro={ultimo} grande />
            <div className="seguir-datos">
              <div className="eti">Seguir leyendo</div>
              <div className="libro-t">{ultimo.titulo}</div>
              {ultimo.autor && <div className="libro-a">{ultimo.autor}</div>}
              <div className="avance">
                <span style={{ width: `${Math.max(2, pct(ultimo))}%` }} />
              </div>
              <div className="avance-t">
                pág. {miles((avances[ultimo.id]?.pagina ?? 0) + 1)} de {miles(ultimo.paginas)}
              </div>
              <button className="btn-tinta">
                Continuar <Icono nombre="arrow-right" tam={16} />
              </button>
            </div>
          </div>
        )}

        {ordenados.length > 0 && (
          <>
            <div className="titulo-sec">
              <b>Mis libros</b>
              <button className="enlace-chico" onClick={() => setQuitando((q) => !q)}>
                {quitando ? 'Listo' : 'Quitar'}
              </button>
            </div>
            <div className="rejilla">
              {ordenados.map((l) => (
                <div key={l.id} className="libro-celda">
                  <button className="libro-boton" onClick={() => (quitando ? pedirQuitar(l) : abrir(l.id))} aria-label={`Abrir ${l.titulo}`}>
                    <Portada libro={l} />
                    {quitando && (
                      <span className="quitar-marca">
                        <Icono nombre="x" tam={14} grosor={2.4} />
                      </span>
                    )}
                  </button>
                  <div className="mini-av">
                    <span style={{ width: `${pct(l)}%` }} />
                  </div>
                  <div className="lib-t" title={l.titulo}>
                    {l.titulo}
                  </div>
                  <div className="lib-m">
                    {pct(l)} % · {tamanoLegible(l.tamano)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {(ordenados.length > 0 || subida) && (
        <button className="subir" onClick={elegir} disabled={!!subida}>
          <Icono nombre="plus" tam={20} grosor={2.2} /> Subir PDF
        </button>
      )}

      <input ref={entrada} type="file" accept="application/pdf,.pdf" hidden onChange={alElegir} />

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
