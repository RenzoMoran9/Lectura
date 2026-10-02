// Elegir el tema de la app: tres muestras con sus colores. Va en «Papel y sonido» y en el estante.

import type { CSSProperties } from 'react';
import { useAjustes } from '../estado/ajustes';
import { Icono } from './Icono';
import { TEMAS } from './temas';

export function ElegirTema() {
  const tema = useAjustes((s) => s.tema);
  const poner = useAjustes((s) => s.poner);
  return (
    <div className="temas" role="radiogroup" aria-label="Tema de la app">
      {TEMAS.map((t) => (
        <button key={t.id} className={`tema ${tema === t.id ? 'on' : ''}`} role="radio" aria-checked={tema === t.id} onClick={() => poner({ tema: t.id })}>
          <span className="tema-m" style={{ '--m-ui': t.ui, '--m-tarjeta': t.tarjeta, '--m-tinta': t.tinta, '--m-acento': t.acento } as CSSProperties}>
            <i />
            <b />
            <em />
            {tema === t.id && (
              <span className="ok">
                <Icono nombre="check" tam={13} grosor={3} />
              </span>
            )}
          </span>
          <span className="tema-n">{t.nombre}</span>
          <span className="tema-d">{t.nota}</span>
        </button>
      ))}
    </div>
  );
}

/** Hoja inferior con el tema (desde el estante). */
export function HojaTema({ alCerrar }: { alCerrar: () => void }) {
  return (
    <div className="velo velo-hoja" onClick={alCerrar}>
      <div className="ajustes ui-claro" role="dialog" aria-label="Tema de la app" onClick={(e) => e.stopPropagation()}>
        <button className="asa" onClick={alCerrar} aria-label="Cerrar" />
        <h3>Tema de la app</h3>
        <ElegirTema />
        <p className="sub" style={{ marginTop: 16 }}>
          Cambia los colores del estante, los menús y las barras. El papel de la hoja se elige aparte, en «Papel y sonido».
        </p>
      </div>
    </div>
  );
}
