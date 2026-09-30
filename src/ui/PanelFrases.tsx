// Panel lateral (pantallas anchas): las frases del libro abierto, con «Repasar frases».

import { useMemo, useState } from 'react';
import { useFrases } from '../estado/frases';
import type { Frase } from '../frases/modelo';
import { Icono } from './Icono';
import { cuando, Repasar, TextoFrase } from './MisFrases';

export function PanelFrases({ libroId, alIr, alCerrar }: { libroId: string; alIr: (pagina: number) => void; alCerrar: () => void }) {
  const todas = useFrases((s) => s.frases);
  const frases = useMemo(
    () => todas.filter((f) => f.libroId === libroId).sort((a, b) => a.pagina - b.pagina || a.creada - b.creada),
    [todas, libroId],
  );
  const [repasando, setRepasando] = useState(false);
  return (
    <aside className="panel-frases ui-claro" aria-label="Mis frases de este libro">
      <div className="panel-cab">
        <h2>Mis frases</h2>
        <span className="sub">de este libro · {frases.length}</span>
        <button className="panel-cerrar" onClick={alCerrar} aria-label="Cerrar panel">
          <Icono nombre="x" tam={18} />
        </button>
      </div>
      <div className="panel-lista">
        {frases.length === 0 && (
          <p className="panel-vacio">Lo que resaltes o encierres en este libro aparecerá aquí. Usa el botón de la esquina.</p>
        )}
        {frases.map((f: Frase) => (
          <article key={f.id} className="tarjeta" onClick={() => alIr(f.pagina)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && alIr(f.pagina)}>
            <p className="q">
              <TextoFrase f={f} />
            </p>
            <div className="meta">
              <span>
                Pág. {f.pagina + 1} · {cuando(f.creada)}
              </span>
              <span className="ir">
                Ir <Icono nombre="arrow-right" tam={14} />
              </span>
            </div>
          </article>
        ))}
        {frases.length > 0 && (
          <button className="repasar ancho" onClick={() => setRepasando(true)}>
            <Icono nombre="shuffle" tam={16} /> Repasar frases
          </button>
        )}
      </div>
      {repasando && (
        <Repasar
          frases={frases}
          alCerrar={() => setRepasando(false)}
          alIr={(f) => {
            setRepasando(false);
            alIr(f.pagina);
          }}
        />
      )}
    </aside>
  );
}
