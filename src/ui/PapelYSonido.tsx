// Hoja inferior «Papel y sonido»: los cuatro papeles, el sonido, su volumen y su tipo.

import { useAjustes } from '../estado/ajustes';
import { PAPELES, TIPOS_PAPEL } from '../hoja/papel';
import { sonido } from '../sonido/sonido';
import { Icono } from './Icono';

export function PapelYSonido({ alCerrar }: { alCerrar: () => void }) {
  const { papel, sonido: conSonido, volumen, juego, poner } = useAjustes();

  return (
    <div className="velo velo-hoja" onClick={alCerrar}>
      <div className="ajustes ui-claro" role="dialog" aria-label="Papel y sonido" onClick={(e) => e.stopPropagation()}>
        <button className="asa" onClick={alCerrar} aria-label="Cerrar" />
        <h3>Papel y sonido</h3>
        <div className="eti-sec">Tipo de papel</div>
        <div className="muestras">
          {TIPOS_PAPEL.map((t) => (
            <button key={t} className={`muestra ${papel === t ? 'on' : ''}`} onClick={() => poner({ papel: t })} aria-pressed={papel === t}>
              <span className={`m papel-${t}`}>
                Aa
                {papel === t && (
                  <span className="ok">
                    <Icono nombre="check" tam={14} grosor={3} />
                  </span>
                )}
              </span>
              <span className="muestra-n">{PAPELES[t].nombre}</span>
            </button>
          ))}
        </div>
        <div className="sep" />
        <label className="fila-aj">
          <Icono nombre="volume-2" tam={20} />
          <span>Sonido al pasar la hoja</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={conSonido}
            onChange={(e) => {
              poner({ sonido: e.target.checked });
              if (e.target.checked) sonido.despertar();
            }}
          />
        </label>
        <div className={`vol ${conSonido ? '' : 'apagado'}`}>
          <small>Volumen</small>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volumen}
            disabled={!conSonido}
            style={{ '--v': `${volumen * 100}%` } as React.CSSProperties}
            onChange={(e) => poner({ volumen: Number(e.target.value) })}
            aria-label="Volumen"
          />
        </div>
        <div className={`seg ${conSonido ? '' : 'apagado'}`} role="radiogroup" aria-label="Tipo de sonido">
          <button className={juego === 'nuevo' ? 'on' : ''} role="radio" aria-checked={juego === 'nuevo'} disabled={!conSonido} onClick={() => poner({ juego: 'nuevo' })}>
            Libro nuevo
          </button>
          <button className={juego === 'antiguo' ? 'on' : ''} role="radio" aria-checked={juego === 'antiguo'} disabled={!conSonido} onClick={() => poner({ juego: 'antiguo' })}>
            Libro antiguo
          </button>
        </div>
        <button className="probar" disabled={!conSonido} onClick={() => sonido.probar()}>
          <Icono nombre="play" tam={15} /> Probar sonido
        </button>
      </div>
    </div>
  );
}
