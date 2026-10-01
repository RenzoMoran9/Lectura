// Índice del libro (hoja inferior): el marcador («Aquí te quedaste») y los capítulos del índice del
// PDF, con los ya leídos marcados y el actual con su avance y lo que falta para terminarlo.

import { useEffect, useRef } from 'react';
import { falta, limitesCapitulo, tiempoLegible, type MarcaLectura, type Ritmo } from '../lectura/lugar';
import type { Capitulo } from '../pdf/indice';
import { Icono } from './Icono';

interface Props {
  capitulos: Capitulo[];
  /** Del PDF, armado por la app con los títulos del texto (o armándose), o no hay. */
  origen?: { tipo: 'pdf' | 'armado' | 'armando' | 'ninguno'; avance?: number };
  pagina: number;
  total: number;
  marcador?: MarcaLectura;
  ritmo?: Ritmo;
  alIr: (pagina: number) => void;
  alMarcador: () => void;
  alCerrar: () => void;
}

export function Indice({ capitulos, origen, pagina, total, marcador, ritmo, alIr, alMarcador, alCerrar }: Props) {
  const actualRef = useRef<HTMLButtonElement>(null);
  const f = falta(ritmo, capitulos, pagina, total);
  const cap = limitesCapitulo(capitulos, pagina, total);

  useEffect(() => {
    actualRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div className="velo velo-hoja" onClick={alCerrar}>
      <div className="ajustes indice ui-claro" role="dialog" aria-label="Índice" onClick={(e) => e.stopPropagation()}>
        <button className="asa" onClick={alCerrar} aria-label="Cerrar" />
        <h3>Índice</h3>
        <div className="indice-sub">
          {f ? (
            <>
              <Icono nombre="reloj" tam={14} /> {tiempoLegible(f.libro)} para terminar el libro
            </>
          ) : (
            `pág. ${(pagina + 1).toLocaleString('es')} de ${total.toLocaleString('es')}`
          )}
        </div>

        {origen?.tipo === 'armado' && capitulos.length > 0 && (
          <p className="indice-armado">Este PDF no traía índice: lo armé con los títulos que encontré en el libro.</p>
        )}

        {marcador && (
          <button className="aqui-quedaste" onClick={alMarcador}>
            <span className="cinta-chica" aria-hidden="true" />
            <span className="eti">Aquí te quedaste · pág. {(marcador.pagina + 1).toLocaleString('es')}</span>
            {marcador.texto && <span className="aqui-texto">«…{marcador.texto}…»</span>}
          </button>
        )}

        {capitulos.length === 0 && origen?.tipo === 'armando' ? (
          <div className="nota indice-armando">
            <p>Este PDF no trae índice: estoy buscando los capítulos en el libro…</p>
            <span className="barrita">
              <i style={{ width: `${Math.max(3, Math.round((origen.avance ?? 0) * 100))}%` }} />
            </span>
          </div>
        ) : capitulos.length === 0 ? (
          <p className="nota">
            Este PDF no trae índice y no encontré títulos de capítulos en su texto (puede ser un PDF escaneado). Puedes saltar de página con la barra de
            abajo (toca la hoja para verla).
          </p>
        ) : (
          <div className="capitulos">
            {capitulos.map((c, i) => {
              const actual = cap?.indice === i;
              const leido = !actual && c.pagina < pagina;
              if (!actual)
                return (
                  <button key={`${c.pagina}-${i}`} className={`capitulo ${leido ? 'leido' : ''}`} onClick={() => alIr(c.pagina)}>
                    {leido && <Icono nombre="check" tam={14} grosor={2.4} />}
                    <span className="capitulo-t">{c.titulo}</span>
                    <span className="capitulo-p">{(c.pagina + 1).toLocaleString('es')}</span>
                  </button>
                );
              const avance = cap ? Math.round(((pagina - cap.inicio) / Math.max(1, cap.fin - cap.inicio)) * 100) : 0;
              return (
                <button key={`${c.pagina}-${i}`} ref={actualRef} className="capitulo actual" onClick={() => alIr(c.pagina)}>
                  <span className="capitulo-t">{c.titulo}</span>
                  <span className="capitulo-p">{(c.pagina + 1).toLocaleString('es')}</span>
                  <span className="capitulo-av">
                    <span className="barrita">
                      <i style={{ width: `${Math.max(3, avance)}%` }} />
                    </span>
                    <small>
                      vas en el {avance} %{f?.capitulo != null ? ` · ${tiempoLegible(f.capitulo)} para terminarlo` : ''}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
