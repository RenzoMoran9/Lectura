// Avisos del lector: el del modo activo arriba («Resaltando · la hoja no se pasa · Listo») y los
// mensajes breves («Guardada en Mis frases · Compartir», «Borrada · Deshacer»).

import { useEffect } from 'react';
import { useFrases } from '../estado/frases';
import type { Herramienta } from '../frases/modelo';
import { Icono, type NombreIcono } from './Icono';

const MODOS: Record<Herramienta, { icono: NombreIcono; texto: string }> = {
  resaltador: { icono: 'highlighter', texto: 'Resaltando · la hoja no se pasa' },
  lapiz: { icono: 'encerrar', texto: 'Encerrando · la hoja no se pasa' },
  recuadro: { icono: 'recuadro', texto: 'Recuadro · arrastra de una esquina a otra' },
  borrador: { icono: 'eraser', texto: 'Borrando · toca una marca' },
};

export function AvisoModo({ texto }: { texto?: string }) {
  const herramienta = useFrases((s) => s.herramienta);
  const usar = useFrases((s) => s.usar);
  if (!herramienta) return null;
  const m = MODOS[herramienta];
  return (
    <div className="aviso-modo" role="status">
      <Icono nombre={m.icono} tam={15} />
      <span>{texto ?? m.texto}</span>
      <button onClick={() => usar(null)}>Listo</button>
    </div>
  );
}

export interface Mensaje {
  texto: string;
  /** Posición (px de la pantalla) cerca de la marca; si no hay, va arriba al centro. */
  x?: number;
  y?: number;
  deshacer?: () => void;
  /** Un botón más (por ejemplo, «Compartir» después de un recuadro). */
  accion?: { texto: string; icono: NombreIcono; hacer: () => void };
  clave: number;
}

export function AvisoBreve({ mensaje, alCerrar }: { mensaje: Mensaje | null; alCerrar: () => void }) {
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(alCerrar, mensaje.deshacer || mensaje.accion ? 4000 : 1800);
    return () => clearTimeout(t);
  }, [mensaje, alCerrar]);
  if (!mensaje) return null;
  const junto = mensaje.x !== undefined && mensaje.y !== undefined;
  return (
    <div
      key={mensaje.clave}
      className={`aviso-breve ${junto ? 'junto' : ''}`}
      style={
        junto
          ? { left: Math.max(12, Math.min(window.innerWidth - (mensaje.accion ? 290 : 200), mensaje.x! - 60)), top: Math.max(60, mensaje.y! - 34) }
          : undefined
      }
      role="status"
    >
      {!mensaje.deshacer && <Icono nombre="check" tam={13} grosor={3} className="ok" />}
      <span>{mensaje.texto}</span>
      {mensaje.deshacer && (
        <button
          onClick={() => {
            mensaje.deshacer?.();
            alCerrar();
          }}
        >
          <Icono nombre="undo-2" tam={14} /> Deshacer
        </button>
      )}
      {mensaje.accion && (
        <button
          onClick={() => {
            mensaje.accion?.hacer();
            alCerrar();
          }}
        >
          <Icono nombre={mensaje.accion.icono} tam={14} /> {mensaje.accion.texto}
        </button>
      )}
    </div>
  );
}
