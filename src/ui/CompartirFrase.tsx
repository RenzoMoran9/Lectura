// Compartir una frase: la hoja con la vista previa, la galería de marcos y dos botones.
// «Guardar imagen» la baja al teléfono; «Compartir» abre el menú del sistema (WhatsApp, Instagram…).

import { useEffect, useRef, useState } from 'react';
import { useAjustes } from '../estado/ajustes';
import { useLibros } from '../estado/libros';
import type { Frase } from '../frases/modelo';
import { cargarLetras, dibujarTarjeta, MARCOS, type DatosTarjeta, type Marco } from '../frases/tarjeta';
import { Icono } from './Icono';

const NOMBRE = 'Entre Hojas - frase.jpg';

/** El recorte de una página escaneada, como imagen para dibujar. */
async function imagenDe(blob: Blob | null | undefined): Promise<HTMLImageElement | null> {
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const comoBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo crear la imagen'))), 'image/jpeg', 0.92));

function bajar(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = NOMBRE;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function CompartirFrase({ f, alCerrar }: { f: Frase; alCerrar: () => void }) {
  const libro = useLibros((s) => s.libros.find((l) => l.id === f.libroId));
  const [marco, setMarco] = useState<Marco>(() => useAjustes.getState().marco ?? 'clasico');
  const [datos, setDatos] = useState<DatosTarjeta | null>(null);
  const [miniaturas, setMiniaturas] = useState<Partial<Record<Marco, string>>>({});
  const [imagen, setImagen] = useState<Blob | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);

  // Las letras y, si la frase es de una página escaneada, su recorte.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [, img] = await Promise.all([cargarLetras(), imagenDe(f.imagen)]);
      if (vivo) setDatos({ titulo: libro?.titulo ?? f.libroTitulo ?? 'Libro', autor: libro?.autor, imagen: img });
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id]);

  // La vista previa (y la imagen ya lista, para compartir al tiro: algunos teléfonos solo dejan
  // compartir si el toque es reciente).
  useEffect(() => {
    const c = lienzo.current;
    if (!c || !datos) return;
    dibujarTarjeta(c, f, datos, marco);
    setImagen(null);
    let vivo = true;
    void comoBlob(c).then((b) => vivo && setImagen(b));
    return () => {
      vivo = false;
    };
  }, [datos, marco, f]);

  // Las miniaturas de la galería, de a una para no trabar la pantalla.
  useEffect(() => {
    if (!datos) return;
    let vivo = true;
    const grande = document.createElement('canvas');
    const chica = document.createElement('canvas');
    chica.width = 135;
    chica.height = 240;
    const pendientes = [...MARCOS];
    const siguiente = () => {
      const m = pendientes.shift();
      if (!m || !vivo) return;
      dibujarTarjeta(grande, f, datos, m.id);
      const ctx = chica.getContext('2d')!;
      ctx.drawImage(grande, 0, 0, chica.width, chica.height);
      const url = chica.toDataURL('image/jpeg', 0.82);
      setMiniaturas((x) => ({ ...x, [m.id]: url }));
      setTimeout(siguiente, 16);
    };
    setTimeout(siguiente, 60);
    return () => {
      vivo = false;
    };
  }, [datos, f]);

  const elegir = (m: Marco) => {
    setMarco(m);
    useAjustes.getState().poner({ marco: m });
    setAviso(null);
  };

  const guardar = () => {
    if (!imagen) return;
    bajar(imagen);
    setAviso('Imagen guardada en tus descargas.');
  };

  const compartir = async () => {
    if (!imagen) return;
    const archivo = new File([imagen], NOMBRE, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo] });
        setAviso(null);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setAviso('No se pudo compartir. Prueba con «Guardar imagen».');
      }
      return;
    }
    // Sin el menú de compartir (por ejemplo, en la computadora): se guarda la imagen.
    bajar(imagen);
    setAviso('Este navegador no deja compartir imágenes: la guardé en tus descargas.');
  };

  return (
    <div className="velo velo-hoja velo-compartir" onClick={alCerrar}>
      <div className="ajustes compartir ui-claro" role="dialog" aria-label="Compartir frase" onClick={(e) => e.stopPropagation()}>
        <button className="asa" onClick={alCerrar} aria-label="Cerrar" />
        <h3>Compartir frase</h3>
        <div className="compartir-sub">Para tu estado o tus historias · 9:16</div>
        <div className="compartir-vista">
          <canvas ref={lienzo} aria-label={`Vista previa con el marco ${MARCOS.find((m) => m.id === marco)?.nombre}`} />
        </div>
        <div className="marcos" role="radiogroup" aria-label="Marco">
          {MARCOS.map((m) => (
            <button key={m.id} className={`marco ${marco === m.id ? 'sel' : ''}`} role="radio" aria-checked={marco === m.id} onClick={() => elegir(m.id)}>
              {miniaturas[m.id] ? <img src={miniaturas[m.id]} alt="" /> : <span className="marco-vacio" />}
              {m.nombre}
            </button>
          ))}
        </div>
        <div className="compartir-botones">
          <button className="guardar" onClick={guardar} disabled={!imagen}>
            <Icono nombre="download" tam={18} /> Guardar imagen
          </button>
          <button className="btn-tinta" onClick={() => void compartir()} disabled={!imagen}>
            <Icono nombre="share" tam={18} /> Compartir
          </button>
        </div>
        {aviso && (
          <p className="compartir-aviso" role="status">
            {aviso}
          </p>
        )}
      </div>
    </div>
  );
}
