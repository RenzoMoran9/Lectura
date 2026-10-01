// Buscar en el libro (hoja inferior): se recorre el texto de las páginas y los resultados aparecen
// a medida que se encuentran, con su página, su capítulo y el fragmento con la palabra marcada.
// El texto leído se guarda mientras la app está abierta: buscar otra vez en el mismo libro es al tiro.

import { useEffect, useRef, useState } from 'react';
import { coincidencias, fragmento, textoDeTrozos } from '../lectura/buscar';
import { capituloDe, type Capitulo } from '../pdf/indice';
import type { DocumentoPdf } from '../pdf/pdf';
import { Icono } from './Icono';

export interface Resultado {
  pagina: number;
  /** Cuál de las coincidencias de esa página (para marcarla al llegar). */
  orden: number;
  antes: string;
  palabra: string;
  despues: string;
}

const MAXIMO = 300;

// El texto de las páginas ya leídas y la última búsqueda, por libro (mientras la app está abierta).
const textos = new Map<string, Map<number, string>>();
const ultima = new Map<string, { consulta: string; resultados: Resultado[]; completa: boolean }>();

interface Props {
  doc: DocumentoPdf;
  libroId: string;
  capitulos: Capitulo[];
  alIr: (r: Resultado, consulta: string) => void;
  alCerrar: () => void;
}

export function BuscarLibro({ doc, libroId, capitulos, alIr, alCerrar }: Props) {
  const previa = ultima.get(libroId);
  const [consulta, setConsulta] = useState(previa?.consulta ?? '');
  const [resultados, setResultados] = useState<Resultado[]>(previa?.resultados ?? []);
  const [leidas, setLeidas] = useState(previa?.completa ? doc.numPages : 0);
  const [estado, setEstado] = useState<'quieto' | 'buscando' | 'listo' | 'sin-texto'>(previa?.completa ? 'listo' : 'quieto');
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!previa) entrada.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = consulta.trim();
    if (q.length < 2) {
      setResultados([]);
      setEstado('quieto');
      return;
    }
    if (previa?.consulta === consulta && previa.completa) return;
    let vivo = true;
    const espera = window.setTimeout(async () => {
      const cache = textos.get(libroId) ?? new Map<number, string>();
      textos.set(libroId, cache);
      const encontrados: Resultado[] = [];
      let conTexto = 0;
      setEstado('buscando');
      setResultados([]);
      for (let i = 0; i < doc.numPages && vivo; i++) {
        let t = cache.get(i);
        if (t === undefined) {
          try {
            const pagina = await doc.getPage(i + 1);
            t = textoDeTrozos((await pagina.getTextContent()).items as { str?: string; hasEOL?: boolean }[]);
          } catch {
            t = '';
          }
          cache.set(i, t);
        }
        if (!vivo) return;
        if (t.trim().length > 20) conTexto++;
        coincidencias(t, q, 20).forEach((c, orden) => {
          if (encontrados.length < MAXIMO) encontrados.push({ pagina: i, orden, ...fragmento(t!, c) });
        });
        // Un libro escaneado (sin capa de texto) no se puede buscar: se dice pronto.
        if (i === 11 && conTexto === 0) {
          setEstado('sin-texto');
          return;
        }
        if (i % 8 === 7 || i === doc.numPages - 1) {
          setResultados([...encontrados]);
          setLeidas(i + 1);
        }
        if (encontrados.length >= MAXIMO) break;
      }
      if (!vivo) return;
      setResultados([...encontrados]);
      setLeidas(doc.numPages);
      setEstado(conTexto ? 'listo' : 'sin-texto');
      ultima.set(libroId, { consulta, resultados: encontrados, completa: true });
    }, 280);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta, doc, libroId]);

  const total = doc.numPages;
  return (
    <div className="velo velo-hoja" onClick={alCerrar}>
      <div className="ajustes buscar-libro ui-claro" role="dialog" aria-label="Buscar en el libro" onClick={(e) => e.stopPropagation()}>
        <button className="asa" onClick={alCerrar} aria-label="Cerrar" />
        <h3>Buscar en el libro</h3>
        <label className="buscar">
          <Icono nombre="search" tam={18} />
          <input
            ref={entrada}
            type="search"
            enterKeyHint="search"
            placeholder="Una palabra o frase"
            value={consulta}
            onChange={(e) => {
              ultima.delete(libroId);
              setConsulta(e.target.value);
              // Lo de la búsqueda anterior se va al tiro: no se confunde con la nueva.
              setResultados([]);
              setLeidas(0);
              setEstado(e.target.value.trim().length >= 2 ? 'buscando' : 'quieto');
            }}
          />
        </label>
        <div className="buscar-estado">
          {estado === 'buscando' && (
            <>
              {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'} · buscando… pág. {Math.min(total, leidas + 1).toLocaleString('es')} de{' '}
              {total.toLocaleString('es')}
            </>
          )}
          {estado === 'listo' &&
            (resultados.length
              ? `${resultados.length >= MAXIMO ? 'Más de ' : ''}${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}`
              : 'No aparece en el libro.')}
          {estado === 'sin-texto' && 'Este libro es escaneado: sus páginas son imágenes y no tienen texto para buscar.'}
          {estado === 'quieto' && 'Sin importar tildes ni mayúsculas.'}
        </div>
        <div className="resultados">
          {resultados.map((r, k) => {
            const cap = capituloDe(capitulos, r.pagina);
            return (
              <button key={k} className="resultado" onClick={() => alIr(r, consulta)}>
                <span className="resultado-pag">
                  Pág. {(r.pagina + 1).toLocaleString('es')}
                  {cap ? ` · ${cap}` : ''}
                </span>
                <span className="resultado-t">
                  {r.antes}
                  <mark>{r.palabra}</mark>
                  {r.despues}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
