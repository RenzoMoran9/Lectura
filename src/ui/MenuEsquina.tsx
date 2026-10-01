// Menú discreto de la esquina: un botón chico y semitransparente que se puede arrastrar a cualquier
// borde. Al tocarlo se abre en abanico hacia el centro con resaltador, lápiz, recuadro, borrador,
// papel y Mis frases; el resaltador, el lápiz y el recuadro muestran su paleta.

import { useEffect, useRef, useState } from 'react';
import { useAjustes } from '../estado/ajustes';
import { useFrases } from '../estado/frases';
import { COLORES_LAPIZ, COLORES_RESALTADOR, LAPICES, rgbDe, type Herramienta } from '../frases/modelo';
import { Icono, type NombreIcono } from './Icono';
import { margenesSeguros } from './seguro';

const TAM = 46; // botón cerrado
const RADIO = 132; // del abanico (seis botones en un cuarto de círculo, sin pisarse)

type Opcion = { id: Herramienta | 'papel' | 'frases'; icono: NombreIcono; nombre: string };
const OPCIONES: Opcion[] = [
  { id: 'resaltador', icono: 'highlighter', nombre: 'Resaltador' },
  { id: 'lapiz', icono: 'encerrar', nombre: 'Encerrar con lápiz' },
  { id: 'recuadro', icono: 'recuadro', nombre: 'Recuadro (como una captura)' },
  { id: 'borrador', icono: 'eraser', nombre: 'Borrador' },
  { id: 'papel', icono: 'file', nombre: 'Papel y sonido' },
  { id: 'frases', icono: 'quote', nombre: 'Mis frases' },
];

const ICONO_HERRAMIENTA: Record<Herramienta, NombreIcono> = { resaltador: 'highlighter', lapiz: 'encerrar', recuadro: 'recuadro', borrador: 'eraser' };
/** Las herramientas que usan los colores del lápiz. */
const conLapiz = (h: Herramienta | null) => h === 'lapiz' || h === 'recuadro';

function useVentana() {
  const [v, setV] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return v;
}

export function MenuEsquina({
  alPapel,
  alFrases,
  alAbrir,
  margenDerecho = 0,
  margenAbajo = 0,
}: {
  alPapel: () => void;
  alFrases: () => void;
  alAbrir?: () => void;
  /** Espacio que ocupa a la derecha el panel lateral, y abajo la barra de páginas. */
  margenDerecho?: number;
  margenAbajo?: number;
}) {
  const { boton, colorResaltador, colorLapiz, poner } = useAjustes();
  const herramienta = useFrases((s) => s.herramienta);
  const usar = useFrases((s) => s.usar);
  const { w, h } = useVentana();
  const [abierto, setAbierto] = useState(false);
  const [arrastre, setArrastre] = useState<{ x: number; y: number } | null>(null);
  const gesto = useRef<{ x: number; y: number; id: number; movido: boolean } | null>(null);

  // Posición del centro del botón.
  const seg = margenesSeguros();
  const margen = 14 + TAM / 2;
  const yMin = seg.arriba + 70;
  const yMax = h - seg.abajo - margen - margenAbajo;
  const ax = arrastre?.x ?? (boton.lado === 'der' ? w - seg.derecha - margen - margenDerecho : seg.izquierda + margen);
  const ay = arrastre?.y ?? yMin + (yMax - yMin) * Math.max(0, Math.min(1, boton.y));

  const bajar = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesto.current = { x: e.clientX, y: e.clientY, id: e.pointerId, movido: false };
  };
  const mover = (e: React.PointerEvent) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId || abierto) return;
    if (!g.movido && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 8) return;
    g.movido = true;
    setArrastre({ x: Math.max(margen, Math.min(w - margen, e.clientX)), y: Math.max(yMin, Math.min(yMax, e.clientY)) });
  };
  const subir = (e: React.PointerEvent) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g || g.id !== e.pointerId) return;
    if (g.movido && arrastre) {
      // Se pega al borde más cercano y recuerda la altura.
      poner({ boton: { lado: arrastre.x < w / 2 ? 'izq' : 'der', y: (arrastre.y - yMin) / Math.max(1, yMax - yMin) } });
      setArrastre(null);
      return;
    }
    // Se avisa afuera del cambio de estado (si no, React se queja: actualiza otro componente al dibujar).
    if (!abierto) alAbrir?.();
    setAbierto(!abierto);
  };

  // Abanico hacia adentro: en una esquina, un cuarto de círculo entre la horizontal y la vertical
  // (como en la propuesta); a media altura, abierto hacia el centro. El resaltador va primero.
  const derecha = ax > w / 2;
  const horizontal = derecha ? 180 : 0;
  const cerca = RADIO + 70;
  const [g0, g1] =
    ay > h - seg.abajo - cerca
      ? [horizontal, derecha ? 270 : -90]
      : ay < seg.arriba + cerca
        ? [horizontal, 90]
        : derecha
          ? [240, 120]
          : [-60, 60];
  const posicion = (i: number) => {
    const a = ((g0 + ((g1 - g0) * i) / (OPCIONES.length - 1)) * Math.PI) / 180;
    return { left: ax + RADIO * Math.cos(a), top: ay + RADIO * Math.sin(a) };
  };

  const elegir = (id: Opcion['id']) => {
    if (id === 'papel') {
      setAbierto(false);
      alPapel();
    } else if (id === 'frases') {
      setAbierto(false);
      alFrases();
    } else {
      usar(id);
      if (id === 'borrador') setAbierto(false);
    }
  };

  const paleta = abierto && (herramienta === 'resaltador' || conLapiz(herramienta));
  const haciaIzq = derecha;
  const colorActivo = conLapiz(herramienta) ? colorLapiz : colorResaltador;

  return (
    <>
      {abierto && (
        <div className="abanico" onPointerDown={() => setAbierto(false)}>
          <div className="abanico-fondo" style={{ left: ax, top: ay, width: (RADIO + 36) * 2, height: (RADIO + 36) * 2 }} />
          {OPCIONES.map((o, i) => {
            const activo = o.id === herramienta;
            return (
              <button
                key={o.id}
                className={`abanico-item ${activo ? 'on' : ''}`}
                style={{ ...posicion(i), animationDelay: `${i * 22}ms` }}
                aria-label={o.nombre}
                aria-pressed={activo}
                title={o.nombre}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => elegir(o.id)}
              >
                <Icono nombre={o.icono} tam={22} />
                {activo && (o.id === 'resaltador' || conLapiz(o.id as Herramienta)) && (
                  <span className="punto-color" style={{ '--c': rgbDe(colorActivo) } as React.CSSProperties} />
                )}
              </button>
            );
          })}
          {paleta && (
            <div
              className="paleta"
              style={{
                top: Math.max(seg.arriba + 12, Math.min(h - seg.abajo - 84, ay - 34)),
                ...(haciaIzq ? { right: w - (ax - RADIO - 34) } : { left: ax + RADIO + 34 }),
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <small>{herramienta === 'lapiz' ? 'Lápiz' : herramienta === 'recuadro' ? 'Recuadro' : 'Resaltador'}</small>
              <div>
                {herramienta === 'resaltador'
                  ? COLORES_RESALTADOR.map((c) => (
                      <button
                        key={c}
                        className={`color ${c === colorResaltador ? 'sel' : ''}`}
                        style={{ '--c': rgbDe(c) } as React.CSSProperties}
                        aria-label={c}
                        onClick={() => {
                          poner({ colorResaltador: c });
                          setAbierto(false);
                        }}
                      />
                    ))
                  : COLORES_LAPIZ.map((c) => (
                      <button
                        key={c}
                        className={`lapiz-color ${c === colorLapiz ? 'sel' : ''}`}
                        style={{ '--c': rgbDe(c), color: LAPICES[c].hex } as React.CSSProperties}
                        onClick={() => {
                          poner({ colorLapiz: c });
                          setAbierto(false);
                        }}
                      >
                        {LAPICES[c].nombre}
                      </button>
                    ))}
              </div>
            </div>
          )}
        </div>
      )}
      <button
        className={`boton-esquina ${abierto ? 'abierto' : ''} ${herramienta ? 'con-herramienta' : ''} ${arrastre ? 'arrastrando' : ''}`}
        style={{ left: ax - TAM / 2, top: ay - TAM / 2 }}
        aria-label={abierto ? 'Cerrar menú' : 'Menú: resaltar, encerrar, recuadro, borrar, papel y Mis frases'}
        aria-expanded={abierto}
        onPointerDown={bajar}
        onPointerMove={mover}
        onPointerUp={subir}
        onPointerCancel={() => {
          gesto.current = null;
          setArrastre(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Icono nombre={abierto ? 'x' : herramienta ? ICONO_HERRAMIENTA[herramienta] : 'highlighter'} tam={21} />
        {!abierto && (herramienta === 'resaltador' || conLapiz(herramienta)) && (
          <span className="punto-color" style={{ '--c': rgbDe(colorActivo) } as React.CSSProperties} />
        )}
      </button>
    </>
  );
}
