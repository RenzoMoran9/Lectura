// «Cómo ver la página» (botón «Aa»): la página original, como viene en el PDF, o «A tu medida»,
// con los renglones acomodados al ancho del celular de pie, y el tamaño de su letra.

import { useAjustes } from '../estado/ajustes';

export const LETRA_MIN = 15;
export const LETRA_MAX = 33;

export function VistaPagina({ deLado, alCerrar }: { deLado: boolean; alCerrar: () => void }) {
  const vistaMedida = useAjustes((s) => s.vistaMedida);
  const letra = useAjustes((s) => s.letraMedida);
  const poner = useAjustes((s) => s.poner);
  const cambiar = (d: number) => poner({ letraMedida: Math.max(LETRA_MIN, Math.min(LETRA_MAX, letra + d)) });
  return (
    <div className="velo velo-hoja" onClick={alCerrar}>
      <div className="ajustes vista-pagina ui-claro" role="dialog" aria-label="Cómo ver la página" onClick={(e) => e.stopPropagation()}>
        <button className="asa" onClick={alCerrar} aria-label="Cerrar" />
        <h3>Cómo ver la página</h3>
        <div className="vista-opciones" role="radiogroup" aria-label="Vista">
          <button role="radio" aria-checked={!vistaMedida} className={!vistaMedida ? 'sel' : ''} onClick={() => poner({ vistaMedida: false })}>
            <b>Original</b>
            <small>La página entera, como en el PDF</small>
          </button>
          <button role="radio" aria-checked={vistaMedida} className={vistaMedida ? 'sel' : ''} onClick={() => poner({ vistaMedida: true })}>
            <b>A tu medida</b>
            <small>Los renglones, al ancho del celular</small>
          </button>
        </div>
        <div className={`vista-letra ${vistaMedida ? '' : 'apagada'}`}>
          <span>Tamaño de la letra</span>
          <button aria-label="Letra más chica" disabled={!vistaMedida || letra <= LETRA_MIN} onClick={() => cambiar(-2)}>
            A−
          </button>
          <button aria-label="Letra más grande" className="grande" disabled={!vistaMedida || letra >= LETRA_MAX} onClick={() => cambiar(2)}>
            A+
          </button>
        </div>
        <p className="vista-nota">
          {deLado
            ? 'Con el celular de lado se ve la página original, a todo el ancho.'
            : vistaMedida
              ? 'Es la letra del libro, recortada palabra por palabra: el PDF no cambia. Para resaltar o encerrar se vuelve un momento a la página original.'
              : 'Si la letra te queda chica, prueba «A tu medida».'}
        </p>
      </div>
    </div>
  );
}
