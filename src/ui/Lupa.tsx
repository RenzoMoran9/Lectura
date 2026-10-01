// La lupa: un vidrio redondo con mango que se lleva con el dedo sobre la hoja. Lo de adentro no es
// la página estirada: se vuelve a dibujar del PDF con todo su detalle (por franjas, a medida que se
// mueve), con el papel, las marcas y el modo noche. Fuera de la lupa, el dedo sigue pasando hojas.

import { useEffect, useRef, useState } from 'react';
import { useAjustes } from '../estado/ajustes';
import { dibujarFrase } from '../frases/dibujo';
import type { Frase } from '../frases/modelo';
import { PAPELES } from '../hoja/papel';
import { Icono } from './Icono';

export type Region = { x: number; y: number; w: number; h: number };

/** Lo que la lupa necesita saber del lector. Coordenadas de la hoja en px CSS. */
export interface FuenteLupa {
  /** La página bajo un punto del lector y ese punto en la hoja; `zoom`: px de pantalla por px de la hoja. */
  bajo: (x: number, y: number) => { indice: number; hx: number; hy: number; zoom: number; hoja: { w: number; h: number } } | null;
  /** La hoja ya dibujada, con su densidad. */
  base: (indice: number) => { lienzo: HTMLCanvasElement; dpr: number } | null;
  /** Un trozo de la hoja dibujado nítido, con `k` píxeles por px CSS. */
  detalle: (indice: number, region: Region, k: number) => Promise<HTMLCanvasElement | null>;
  /** Dónde está la página del PDF en la hoja y a qué escala (para dibujar las marcas). */
  ubicacion: (indice: number) => { x: number; y: number; escala: number } | undefined;
  frases: (indice: number) => Frase[];
}

export const AUMENTOS = [1.5, 2, 2.5, 3];
const comoTexto = (n: number) => `${String(n).replace('.', ',')}×`;
/** Píxeles que puede tener una franja dibujada para la lupa (memoria del teléfono). */
const MAX_FRANJA = 6e6;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Un número por lienzo, para saber si la hoja de abajo cambió. */
const ids = new WeakMap<object, number>();
let siguienteId = 1;
const idDe = (o: object | null | undefined) => {
  if (!o) return 0;
  let n = ids.get(o);
  if (!n) ids.set(o, (n = siguienteId++));
  return n;
};

export function Lupa({ fuente, oculta, ancho, alto }: { fuente: FuenteLupa; oculta: boolean; ancho: number; alto: number }) {
  const guardada = useAjustes((s) => s.lupa);
  const aumento = guardada?.aumento ?? 2;
  const D = Math.round(Math.max(170, Math.min(300, Math.min(ancho, alto) * 0.6)));
  const limitar = (x: number, y: number) => ({
    x: Math.max(D * 0.2, Math.min(ancho - D * 0.2, x)),
    y: Math.max(D * 0.2, Math.min(alto - D * 0.2, y)),
  });
  const [centro, setCentro] = useState(() => limitar((guardada?.x ?? 0.5) * ancho, (guardada?.y ?? 0.55) * alto));
  const centroRef = useRef(centro);
  centroRef.current = centro;
  const aumentoRef = useRef(aumento);
  aumentoRef.current = aumento;
  const [menu, setMenu] = useState(false);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const arrastre = useRef<{ id: number; dx: number; dy: number } | null>(null);

  // Al girar el celular, la lupa se queda en el mismo lugar relativo.
  useEffect(() => {
    const g = useAjustes.getState().lupa;
    setCentro(limitar((g?.x ?? 0.5) * ancho, (g?.y ?? 0.55) * alto));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancho, alto, D]);

  // Se dibuja en cada cuadro solo si algo cambió (la posición, el zoom, la página, la franja nítida…).
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const lado = Math.round(D * dpr);
    c.width = c.height = lado;
    const trabajo = document.createElement('canvas');
    trabajo.width = trabajo.height = lado;
    const ctx = c.getContext('2d')!;
    const w = trabajo.getContext('2d')!;
    let franja: { indice: number; region: Region; k: number; lienzo: HTMLCanvasElement } | null = null;
    let pedida = '';
    let clavePrevia = '';
    let centroPrevio = '';
    let quietoDesde = performance.now();
    let raf = 0;

    const pedirFranja = (indice: number, hx: number, hy: number, vista: number, S: number, hoja: { w: number; h: number }) => {
      const h = Math.min(hoja.h, vista * 2.6);
      const wd = Math.min(hoja.w, Math.max(vista * 2.6, MAX_FRANJA / (S * S) / h));
      const k = Math.min(S, Math.sqrt(MAX_FRANJA / (wd * h)));
      const region = {
        x: Math.max(0, Math.min(hoja.w - wd, hx - wd / 2)),
        y: Math.max(0, Math.min(hoja.h - h, hy - h / 2)),
        w: wd,
        h,
      };
      const clave = `${indice}|${Math.round(region.x)}|${Math.round(region.y)}|${k.toFixed(2)}`;
      if (clave === pedida) return;
      pedida = clave;
      void fuente.detalle(indice, region, k).then((l) => {
        if (l && pedida === clave) franja = { indice, region, k, lienzo: l };
      });
    };

    const cuadro = () => {
      raf = requestAnimationFrame(cuadro);
      const { x, y } = centroRef.current;
      const b = fuente.bajo(x, y);
      const papel = useAjustes.getState().papel;
      const ahora = performance.now();
      const posicion = `${x.toFixed(1)}|${y.toFixed(1)}`;
      if (posicion !== centroPrevio) {
        centroPrevio = posicion;
        quietoDesde = ahora;
      }
      if (!b) {
        const clave = `nada|${papel}`;
        if (clave !== clavePrevia) {
          clavePrevia = clave;
          ctx.fillStyle = PAPELES[papel].color;
          ctx.fillRect(0, 0, lado, lado);
        }
        return;
      }
      const S = aumentoRef.current * b.zoom * dpr; // px de la lupa por px de la hoja
      const vista = lado / S; // px de la hoja que se ven de lado a lado
      const izq = b.hx - vista / 2;
      const arriba = b.hy - vista / 2;
      const base = fuente.base(b.indice);
      const frases = fuente.frases(b.indice);
      // ¿La franja nítida cubre lo que se ve, con la densidad que hace falta?
      const sirve =
        franja &&
        franja.indice === b.indice &&
        Math.abs(franja.k - Math.min(S, Math.sqrt(MAX_FRANJA / (franja.region.w * franja.region.h)))) < 0.05 * franja.k &&
        izq >= franja.region.x - 1 &&
        arriba >= franja.region.y - 1 &&
        izq + vista <= franja.region.x + franja.region.w + 1 &&
        arriba + vista <= franja.region.y + franja.region.h + 1;
      // Se pide otra al quedarse quieta un momento (o si la que hay ya no sirve para nada).
      if (!sirve && (ahora - quietoDesde > 90 || !franja || franja.indice !== b.indice)) pedirFranja(b.indice, b.hx, b.hy, vista, S, b.hoja);

      const clave = [b.indice, izq.toFixed(2), arriba.toFixed(2), S.toFixed(3), idDe(base?.lienzo), idDe(franja?.lienzo), papel, frases.map((f) => f.id).join()].join('|');
      if (clave === clavePrevia) return;
      clavePrevia = clave;

      // 1. La hoja (blanca, con su tinta), primero la de siempre y encima la nítida.
      w.globalCompositeOperation = 'source-over';
      w.fillStyle = '#fff';
      w.fillRect(0, 0, lado, lado);
      if (base) {
        const k = base.dpr;
        w.drawImage(base.lienzo, izq * k, arriba * k, vista * k, vista * k, 0, 0, lado, lado);
      }
      if (franja && franja.indice === b.indice) {
        const { region: r, k } = franja;
        w.drawImage(franja.lienzo, (izq - r.x) * k, (arriba - r.y) * k, vista * k, vista * k, 0, 0, lado, lado);
      }
      // 2. Las marcas (resaltador, lápiz, recuadro).
      const ub = fuente.ubicacion(b.indice);
      if (ub && frases.length) {
        w.globalCompositeOperation = 'multiply';
        const u = { x: ub.x - izq, y: ub.y - arriba, escala: ub.escala, dpr: S };
        for (const f of frases) dibujarFrase(w, f, u);
      }
      // 3. El papel: en los claros se multiplica; de noche se invierte la luz con un tono cálido.
      const p = PAPELES[papel];
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = p.color;
      ctx.fillRect(0, 0, lado, lado);
      if (papel === 'noche') {
        const [fr, fg, fb] = rgb(p.color);
        const [tr, tg, tb] = rgb(p.tinta);
        w.globalCompositeOperation = 'difference';
        w.fillStyle = '#fff';
        w.fillRect(0, 0, lado, lado);
        w.globalCompositeOperation = 'multiply';
        w.fillStyle = `rgb(${tr - fr},${tg - fg},${tb - fb})`;
        w.fillRect(0, 0, lado, lado);
        ctx.globalCompositeOperation = 'lighter';
      } else ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(trabajo, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, [fuente, D]);

  // Arrastrar la lupa (por el vidrio o por el mango). El lector no se entera: la hoja no se pasa.
  const bajar = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const c = centroRef.current;
    arrastre.current = { id: e.pointerId, dx: e.clientX - c.x, dy: e.clientY - c.y };
    setMenu(false);
  };
  const mover = (e: React.PointerEvent) => {
    e.stopPropagation();
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    setCentro(limitar(e.clientX - a.dx, e.clientY - a.dy));
  };
  const soltar = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (arrastre.current?.id !== e.pointerId) return;
    arrastre.current = null;
    const c = centroRef.current;
    const g = useAjustes.getState().lupa;
    useAjustes.getState().poner({ lupa: { activa: true, aumento: g?.aumento ?? 2, x: c.x / ancho, y: c.y / alto } });
  };
  const sinArrastre = (e: React.PointerEvent) => e.stopPropagation();

  // El mango va hacia el lado donde hay lugar; los botones, al lado contrario.
  const derecha = centro.x > ancho * 0.58;
  const abajo = centro.y > alto - D * 1.05;
  const angulo = abajo ? (derecha ? 135 : -135) : derecha ? 45 : -45;
  const r = D / 2;

  return (
    <div
      className={`lupa ${oculta ? 'oculta' : ''} ${abajo ? 'botones-abajo' : ''}`}
      style={{ left: centro.x - r, top: centro.y - r, width: D, height: D }}
      onPointerDown={bajar}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* El mango nace debajo del aro (su virola queda tapada por el borde): así se ve unido. */}
      <div className="lupa-mango" style={{ transform: `rotate(${angulo}deg) translateY(${r + 2}px)` }} />
      <canvas ref={lienzo} className="lupa-vidrio" />
      <div className="lupa-brillo" aria-hidden="true" />
      <div className="lupa-aro" aria-hidden="true" />
      <button
        className="lupa-cerrar"
        aria-label="Quitar la lupa"
        onPointerDown={sinArrastre}
        onClick={() => {
          const g = useAjustes.getState().lupa;
          useAjustes.getState().poner({ lupa: { x: g?.x ?? 0.5, y: g?.y ?? 0.55, aumento: g?.aumento ?? 2, activa: false } });
        }}
      >
        <Icono nombre="x" tam={13} grosor={2.6} />
      </button>
      <button className="lupa-aumento" aria-label={`Aumento: ${comoTexto(aumento)}`} aria-expanded={menu} onPointerDown={sinArrastre} onClick={() => setMenu((m) => !m)}>
        {comoTexto(aumento)}
      </button>
      {menu && (
        <div className="lupa-menu" role="radiogroup" aria-label="Aumento" onPointerDown={sinArrastre}>
          {AUMENTOS.map((a) => (
            <button
              key={a}
              role="radio"
              aria-checked={a === aumento}
              className={a === aumento ? 'sel' : ''}
              onClick={() => {
                const g = useAjustes.getState().lupa;
                const c = centroRef.current;
                useAjustes.getState().poner({ lupa: { activa: true, x: g?.x ?? c.x / ancho, y: g?.y ?? c.y / alto, aumento: a } });
                setMenu(false);
              }}
            >
              {comoTexto(a)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
