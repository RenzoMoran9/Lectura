// Apertura de PDFs con PDF.js (pdfjs-dist, Apache-2.0).
// El archivo nunca se carga entero: PDF.js pide rangos de bytes y aquí se leen del archivo
// guardado (Blob/File, que el navegador tiene en disco) con `slice`. Así el tamaño no importa.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import urlTrabajador from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = urlTrabajador;

export type DocumentoPdf = PDFDocumentProxy;

class TransporteArchivo extends pdfjs.PDFDataRangeTransport {
  private archivo: Blob;
  /** Bytes que PDF.js ha pedido desde que se abrió. */
  leidos = 0;
  constructor(archivo: Blob) {
    super(archivo.size, null);
    this.archivo = archivo;
  }
  override requestDataRange(inicio: number, fin: number) {
    this.leidos += fin - inicio;
    this.archivo
      .slice(inicio, fin)
      .arrayBuffer()
      .then((datos) => this.onDataRange(inicio, new Uint8Array(datos)))
      .catch((e) => console.error('No se pudo leer una parte del PDF', e));
  }
}

const transportes = new WeakMap<DocumentoPdf, TransporteArchivo>();

/**
 * Bytes leídos por un documento abierto. PDF.js guarda en memoria todo lo que ya leyó y no lo
 * suelta; con libros enormes conviene volver a abrirlo de vez en cuando (ver `Lector`).
 */
export const bytesLeidos = (doc: DocumentoPdf) => transportes.get(doc)?.leidos ?? 0;

export class PdfConClave extends Error {}
export class PdfDanado extends Error {}

export async function abrirPdf(archivo: Blob, clave?: string): Promise<DocumentoPdf> {
  const base = import.meta.env.BASE_URL;
  const transporte = new TransporteArchivo(archivo);
  const tarea = pdfjs.getDocument({
    range: transporte,
    rangeChunkSize: 64 * 1024,
    disableAutoFetch: true,
    disableStream: true,
    password: clave,
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    wasmUrl: `${base}pdfjs/wasm/`,
    iccUrl: `${base}pdfjs/iccs/`,
    enableXfa: false,
  });
  try {
    const doc = await tarea.promise;
    transportes.set(doc, transporte);
    return doc;
  } catch (e) {
    const nombre = (e as { name?: string })?.name;
    if (nombre === 'PasswordException') throw new PdfConClave('Este PDF tiene contraseña.');
    if (nombre === 'InvalidPDFException') throw new PdfDanado('Este archivo no parece un PDF válido.');
    throw e;
  }
}

/** Cierra el documento y libera el trabajador de PDF.js. */
export function cerrarPdf(doc: DocumentoPdf | null | undefined) {
  if (doc) void doc.loadingTask.destroy().catch(() => {});
}

/** Título del PDF (de sus metadatos) o, si no tiene, el nombre del archivo. */
export async function tituloDelPdf(doc: DocumentoPdf, nombreArchivo: string): Promise<{ titulo: string; autor: string }> {
  let titulo = '';
  let autor = '';
  try {
    const info = (await doc.getMetadata()).info as Record<string, unknown>;
    titulo = typeof info?.Title === 'string' ? info.Title.trim() : '';
    autor = typeof info?.Author === 'string' ? info.Author.trim() : '';
  } catch {
    /* sin metadatos */
  }
  // Muchos PDF traen títulos de relleno («Microsoft Word - doc1.docx», «untitled»…).
  if (!titulo || /^(untitled|sin t[ií]tulo|microsoft word|documento?\d*)/i.test(titulo) || /\.(docx?|pdf|indd)$/i.test(titulo)) {
    titulo = nombreArchivo.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Libro sin título';
  }
  return { titulo, autor };
}
