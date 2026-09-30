// Guarda el PDF tal cual, sin convertirlo. Primero intenta en OPFS (el sistema de archivos privado
// del navegador), escribiendo por partes para que un libro enorme no pase entero por la memoria.
// Si el navegador no lo permite, lo guarda en IndexedDB.

import { borrarLibro, guardarArchivoIdb, leerArchivoIdb, type Almacen } from './bd';

const CARPETA = 'libros';

type ConEscritura = FileSystemFileHandle & {
  createWritable?: () => Promise<FileSystemWritableFileStream>;
};

async function carpeta() {
  const raiz = await navigator.storage.getDirectory();
  return raiz.getDirectoryHandle(CARPETA, { create: true });
}

const nombre = (id: string) => `${id}.pdf`;

/** Pide al navegador que no borre los libros cuando le falte espacio. */
export async function pedirPersistencia() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export class SinEspacio extends Error {}

function esFaltaDeEspacio(e: unknown) {
  const n = (e as { name?: string })?.name;
  return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/** Copia `archivo` al almacén local. `progreso` recibe los bytes escritos. */
export async function guardarArchivo(id: string, archivo: Blob, progreso?: (bytes: number) => void): Promise<Almacen> {
  try {
    if (typeof navigator.storage?.getDirectory === 'function') {
      const dir = await carpeta();
      const manejador = (await dir.getFileHandle(nombre(id), { create: true })) as ConEscritura;
      if (manejador.createWritable) {
        const escritor = await manejador.createWritable();
        let escritos = 0;
        const contador = new TransformStream<Uint8Array, Uint8Array>({
          transform(parte, control) {
            escritos += parte.byteLength;
            progreso?.(escritos);
            control.enqueue(parte);
          },
        });
        try {
          await archivo.stream().pipeThrough(contador).pipeTo(escritor);
          return 'opfs';
        } catch (e) {
          await dir.removeEntry(nombre(id)).catch(() => {});
          if (esFaltaDeEspacio(e)) throw new SinEspacio();
          throw e;
        }
      }
      await dir.removeEntry(nombre(id)).catch(() => {});
    }
  } catch (e) {
    if (e instanceof SinEspacio) throw e;
    console.warn('OPFS no disponible; se guarda en IndexedDB', e);
  }
  try {
    await guardarArchivoIdb(id, archivo);
    progreso?.(archivo.size);
    return 'idb';
  } catch (e) {
    if (esFaltaDeEspacio(e)) throw new SinEspacio();
    throw e;
  }
}

/** El PDF guardado, como Blob respaldado en disco: se lee por partes con `slice`. */
export async function leerArchivo(id: string, almacen: Almacen): Promise<Blob | undefined> {
  if (almacen === 'opfs') {
    try {
      const dir = await carpeta();
      return await (await dir.getFileHandle(nombre(id))).getFile();
    } catch {
      return undefined;
    }
  }
  return leerArchivoIdb(id);
}

export async function quitarLibro(id: string, almacen: Almacen) {
  if (almacen === 'opfs') {
    try {
      await (await carpeta()).removeEntry(nombre(id));
    } catch {
      /* ya no estaba */
    }
  }
  await borrarLibro(id);
}
