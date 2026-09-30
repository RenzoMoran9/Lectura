// Portada de un libro: la imagen guardada (del PDF, de internet o de tela) o, si no hay, su título.

import { useEffect, useState } from 'react';
import type { Libro } from '../datos/bd';

/** Dirección para mostrar un Blob que se libera sola al dejar de usarse. */
export function useUrlDeBlob(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function Portada({ libro, grande, className = '' }: { libro: Libro; grande?: boolean; className?: string }) {
  // Una portada de internet que no se pudo guardar se ve desde su dirección; si no carga (sin
  // conexión y sin caché), se muestra la primera página del PDF.
  const [fallo, setFallo] = useState(false);
  useEffect(() => setFallo(false), [libro.portadaUrl]);
  const enLinea = !libro.portada && libro.portadaUrl && !fallo ? libro.portadaUrl : null;
  const deBlob = useUrlDeBlob(libro.portada ?? (enLinea ? null : libro.portadaPdf));
  const url = deBlob ?? enLinea;
  return (
    <div className={`portada ${grande ? 'grande' : ''} ${className}`}>
      {url ? (
        <img src={url} alt="" draggable={false} onError={() => !deBlob && setFallo(true)} />
      ) : (
        <span className="portada-t">{libro.titulo}</span>
      )}
    </div>
  );
}
