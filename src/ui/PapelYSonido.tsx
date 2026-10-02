// Hoja inferior «Papel y sonido»: los cuatro papeles, el tema de la app, el sonido de la hoja (volumen y tipo) y el
// sonido de fondo de este libro (para relajarse o según su género), con su propio volumen.

import { useAjustes } from '../estado/ajustes';
import { useLibros } from '../estado/libros';
import { PAPELES, TIPOS_PAPEL } from '../hoja/papel';
import { luzActual } from '../lectura/luz';
import { AMBIENTES, type TipoAmbiente } from '../sonido/ambiente';
import { sonido } from '../sonido/sonido';
import { ElegirTema } from './ElegirTema';
import { Icono, type NombreIcono } from './Icono';

function Ambiente({ id, nombre, icono, on, alElegir }: { id: string; nombre: string; icono: NombreIcono; on: boolean; alElegir: () => void }) {
  return (
    <button className={`ambiente ambiente-${id} ${on ? 'on' : ''}`} onClick={alElegir} aria-pressed={on}>
      <span className="ambiente-i">
        <Icono nombre={icono} tam={22} />
      </span>
      <span className="ambiente-n">{nombre}</span>
    </button>
  );
}

export function PapelYSonido({ libroId, alCerrar }: { libroId: string; alCerrar: () => void }) {
  const { papel, sonido: conSonido, volumen, juego, volumenAmbiente, luzAuto, brillo, tibieza, poner } = useAjustes();
  const luz = luzActual({ luzAuto, brillo, tibieza });
  const hora = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const elegido = useLibros((s) => s.libros.find((l) => l.id === libroId)?.ambiente ?? null);
  const actualizar = useLibros((s) => s.actualizar);
  const elegir = (tipo: TipoAmbiente | null) => {
    sonido.despertar();
    void actualizar(libroId, { ambiente: tipo ?? undefined });
  };

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
        <div className="eti-sec">Tema de la app</div>
        <ElegirTema />
        <div className="sep" />
        <div className="eti-sec">Luz del papel</div>
        <label className="fila-aj">
          <Icono nombre="luna" tam={20} />
          <span>Más cálida y tenue de noche</span>
          <input type="checkbox" role="switch" className="switch" checked={luzAuto} onChange={(e) => poner({ luzAuto: e.target.checked })} />
        </label>
        <div className={`vol luz ${luzAuto ? 'apagado' : ''}`}>
          <small>Brillo</small>
          <input
            type="range"
            min={0.6}
            max={1}
            step={0.01}
            value={luz.brillo}
            disabled={luzAuto}
            style={{ '--v': `${((luz.brillo - 0.6) / 0.4) * 100}%` } as React.CSSProperties}
            onChange={(e) => poner({ brillo: Number(e.target.value) })}
            aria-label="Brillo del papel"
          />
        </div>
        <div className={`vol luz tibieza ${luzAuto ? 'apagado' : ''}`}>
          <small>Tibieza</small>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={luz.tibieza}
            disabled={luzAuto}
            style={{ '--v': `${luz.tibieza * 100}%` } as React.CSSProperties}
            onChange={(e) => poner({ tibieza: Number(e.target.value) })}
            aria-label="Tibieza del papel"
          />
        </div>
        {luzAuto && (
          <p className="nota-luz">
            Ahora ({hora}) se ajusta sola: desde las 18 h el papel se entibia poco a poco, y vuelve a la luz del día por la mañana.
          </p>
        )}

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

        <div className="sep" />
        <div className="eti-sec fila-eti">
          <span>Sonido de fondo</span>
          <span className="eti-nota">se recuerda en este libro</span>
        </div>
        <div className="sub-eti">Para relajarse</div>
        <div className="ambientes">
          <Ambiente id="ninguno" nombre="Ninguno" icono="volume-x" on={!elegido} alElegir={() => elegir(null)} />
          {AMBIENTES.filter((a) => a.grupo === 'relajarse').map((a) => (
            <Ambiente key={a.id} id={a.id} nombre={a.nombre} icono={a.icono} on={elegido === a.id} alElegir={() => elegir(a.id)} />
          ))}
        </div>
        <div className="sub-eti">Según el libro</div>
        <div className="ambientes">
          {AMBIENTES.filter((a) => a.grupo === 'genero').map((a) => (
            <Ambiente key={a.id} id={a.id} nombre={a.nombre} icono={a.icono} on={elegido === a.id} alElegir={() => elegir(a.id)} />
          ))}
        </div>
        <div className={`vol vol-ambiente ${elegido ? '' : 'apagado'}`}>
          <small>Volumen</small>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volumenAmbiente}
            disabled={!elegido}
            style={{ '--v': `${volumenAmbiente * 100}%` } as React.CSSProperties}
            onChange={(e) => poner({ volumenAmbiente: Number(e.target.value) })}
            aria-label="Volumen del sonido de fondo"
          />
        </div>
      </div>
    </div>
  );
}
