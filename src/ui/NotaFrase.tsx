// Una nota corta mía en una frase: se escribe ahí mismo y se guarda al salir del cuadro.

import { useEffect, useRef, useState } from 'react';
import { useFrases } from '../estado/frases';
import { NOTA_MAX, type Frase } from '../frases/modelo';
import { Icono } from './Icono';

export function NotaFrase({ f, editando, alTerminar }: { f: Frase; editando: boolean; alTerminar: () => void }) {
  const actualizar = useFrases((s) => s.actualizar);
  const [texto, setTexto] = useState(f.nota ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editando) return;
    setTexto(f.nota ?? '');
    const a = area.current;
    a?.focus();
    a?.setSelectionRange(a.value.length, a.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  const guardar = () => {
    const limpio = texto.trim().slice(0, NOTA_MAX);
    if (limpio !== (f.nota ?? '')) void actualizar(f.id, { nota: limpio || undefined });
    alTerminar();
  };

  if (editando)
    return (
      <div className="nota-edita" onClick={(e) => e.stopPropagation()}>
        <textarea
          ref={area}
          value={texto}
          maxLength={NOTA_MAX}
          rows={2}
          placeholder="Escribe una nota corta…"
          onChange={(e) => setTexto(e.target.value)}
          onBlur={guardar}
          onKeyDown={(e) => {
            // Las teclas son de la nota: no llegan a la tarjeta (con Enter abriría el libro).
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              guardar();
            }
            if (e.key === 'Escape') alTerminar();
          }}
        />
        <span className="nota-cuenta">{NOTA_MAX - texto.length}</span>
      </div>
    );
  if (!f.nota) return null;
  return (
    <p className="nota-frase">
      <Icono nombre="lapiz" tam={13} />
      <span>{f.nota}</span>
    </p>
  );
}
