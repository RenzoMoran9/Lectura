// Repaso del día, tipo tarjetas: las frases que tocan hoy, de una en una. «La recordaba» la manda
// más lejos (3, 7, 14… días); «Repasar de nuevo», a mañana. Al terminar, la racha de días seguidos.

import { useState } from 'react';
import { useAjustes } from '../estado/ajustes';
import { useFrases } from '../estado/frases';
import { useLibros } from '../estado/libros';
import type { Frase } from '../frases/modelo';
import { responder, sumarRacha } from '../frases/repaso';
import { Icono } from './Icono';
import { cuando, TextoFrase } from './MisFrases';
import { CompartirFrase } from './CompartirFrase';
import { NotaFrase } from './NotaFrase';

export function RepasoDiario({ frases, alCerrar, alIr }: { frases: Frase[]; alCerrar: () => void; alIr: (f: Frase) => void }) {
  // La lista se fija al abrir: lo que se responde no la cambia mientras se repasa.
  const [mazo] = useState(frases);
  const [i, setI] = useState(0);
  const [recordadas, setRecordadas] = useState(0);
  const libros = useLibros((s) => s.libros);
  const actualizar = useFrases((s) => s.actualizar);
  const racha = useAjustes((s) => s.racha);
  const [compartir, setCompartir] = useState(false);
  const f = mazo[i];

  const responderCon = (recordaba: boolean) => {
    if (!f) return;
    const ahora = Date.now();
    void actualizar(f.id, { repaso: responder(f, recordaba, ahora) });
    const a = useAjustes.getState();
    a.poner({ racha: sumarRacha(a.racha, ahora) });
    if (recordaba) setRecordadas((n) => n + 1);
    setI(i + 1);
  };

  return (
    <div className="repasar-velo" role="dialog" aria-label="Repaso del día">
      <button className="repasar-cerrar" onClick={alCerrar} aria-label="Cerrar">
        <Icono nombre="x" tam={22} />
      </button>
      {f ? (
        <div className="repasar-cont">
          <div className="eti">
            Repaso del día · {i + 1} de {mazo.length}
          </div>
          <div className="repaso-avance">
            <i style={{ width: `${(i / mazo.length) * 100}%` }} />
          </div>
          <article key={f.id} className="repasar-tarjeta papel-crema">
            <p className="q">
              <TextoFrase f={f} />
            </p>
            <div className="repasar-meta">
              {libros.find((l) => l.id === f.libroId)?.titulo ?? f.libroTitulo ?? 'Libro'} · pág. {f.pagina + 1} · {cuando(f.creada)}
            </div>
            <NotaFrase f={f} editando={false} alTerminar={() => {}} />
          </article>
          <div className="repaso-botones">
            <button className="otra-vez" onClick={() => responderCon(false)}>
              Repasar de nuevo
            </button>
            <button className="la-recordaba" onClick={() => responderCon(true)}>
              La recordaba <Icono nombre="check" tam={16} grosor={2.4} />
            </button>
          </div>
          <div className="repaso-enlaces">
            <button className="enlace-ir" onClick={() => setCompartir(true)}>
              <Icono nombre="share" tam={15} /> Compartir
            </button>
            {libros.some((l) => l.id === f.libroId) && (
              <button className="enlace-ir" onClick={() => alIr(f)}>
                Ir a la página <Icono nombre="arrow-right" tam={15} />
              </button>
            )}
          </div>
          {compartir && <CompartirFrase f={f} alCerrar={() => setCompartir(false)} />}
          <p className="repasar-cuenta repaso-pie">
            Las que recuerdas vuelven cada vez más espaciadas{racha && racha.dias > 1 ? ` · racha: ${racha.dias} días` : ''}
          </p>
        </div>
      ) : (
        <div className="repasar-cont">
          <div className="eti">Repaso del día</div>
          <article className="repasar-tarjeta papel-crema repaso-fin">
            <p className="repaso-fin-t">¡Listo por hoy!</p>
            <p className="repaso-fin-p">
              {mazo.length} {mazo.length === 1 ? 'frase repasada' : 'frases repasadas'} · recordaste {recordadas}.
              <br />
              Las que recordaste vuelven más adelante; las otras, mañana.
            </p>
            {racha && racha.dias > 1 && <p className="repaso-racha">🔥 {racha.dias} días seguidos</p>}
          </article>
          <div className="repasar-botones">
            <button className="btn-tinta" onClick={alCerrar}>
              Volver al estante
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
