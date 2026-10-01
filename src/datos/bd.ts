// Base de datos local (IndexedDB): los libros, el avance de cada uno y, si el navegador no tiene
// OPFS, también los archivos PDF tal cual.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Frase } from '../frases/modelo';
import type { Capitulo } from '../pdf/indice';
import type { MarcaLectura, Ritmo } from '../lectura/lugar';
import type { TipoAmbiente } from '../sonido/ambiente';

export type Almacen = 'opfs' | 'idb';

export interface Libro {
  id: string; // huella del PDF (fingerprint de PDF.js)
  titulo: string;
  autor: string;
  nombreArchivo: string;
  tamano: number; // bytes
  paginas: number;
  almacen: Almacen;
  agregado: number;
  /** La portada que se ve en el estante. */
  portada?: Blob | null;
  /** Si la portada es una imagen de internet que no se pudo descargar, se muestra desde su dirección. */
  portadaUrl?: string;
  /** La primera página del PDF, para poder volver a ella. */
  portadaPdf?: Blob | null;
  portadaOrigen?: 'pdf' | 'internet' | 'tela';
  /** Estilo de la portada de tela (índice en ESTILOS_TELA). */
  portadaTela?: number;
  /** El marcador que dejé con el dedo sobre la línea donde me quedé. */
  marcador?: MarcaLectura;
  /** Sonido de fondo elegido para leer este libro. */
  ambiente?: TipoAmbiente;
  /** Ya se buscó su portada en internet (o la eligió el usuario): no se vuelve a buscar sola. */
  portadaBuscada?: boolean;
  /** Si el PDF no trae índice: el que armó la app con los títulos que encontró (vacío: no halló ninguno). */
  indiceArmado?: Capitulo[];
}

export interface Avance {
  libroId: string;
  pagina: number; // índice desde 0
  total: number;
  actualizado: number;
  /** Capítulo en el que va (del índice del PDF), si lo tiene. */
  capitulo?: string;
  /** Con zoom o de lado: a qué altura de la página iba (0 arriba, 1 abajo). */
  cy?: number;
  /** En «A tu medida»: en qué hoja de la página iba. */
  parte?: number;
  /** Cuántos segundos tardo por página en este libro (para saber cuánto falta). */
  ritmo?: Ritmo;
  /** Cuánto me falta, en segundos, a mi ritmo (para el estante). */
  falta?: { libro: number; capitulo?: number };
}

interface Esquema extends DBSchema {
  libros: { key: string; value: Libro };
  avance: { key: string; value: Avance; indexes: { porFecha: number } };
  archivos: { key: string; value: Blob };
  frases: { key: string; value: Frase; indexes: { porLibro: string } };
}

let conexion: Promise<IDBPDatabase<Esquema>> | null = null;

export function bd() {
  conexion ??= openDB<Esquema>('entre-hojas', 2, {
    upgrade(db, antes) {
      if (antes < 1) {
        db.createObjectStore('libros', { keyPath: 'id' });
        const avance = db.createObjectStore('avance', { keyPath: 'libroId' });
        avance.createIndex('porFecha', 'actualizado');
        db.createObjectStore('archivos');
      }
      if (antes < 2) {
        const frases = db.createObjectStore('frases', { keyPath: 'id' });
        frases.createIndex('porLibro', 'libroId');
      }
    },
  });
  return conexion;
}

export async function listarLibros(): Promise<Libro[]> {
  return (await bd()).getAll('libros');
}

export async function obtenerLibro(id: string) {
  return (await bd()).get('libros', id);
}

export async function guardarLibro(libro: Libro) {
  await (await bd()).put('libros', libro);
}

/** Quita el libro del estante. Sus frases se conservan: si vuelves a subir el mismo PDF, reaparecen. */
export async function borrarLibro(id: string) {
  const db = await bd();
  const tx = db.transaction(['libros', 'avance', 'archivos'], 'readwrite');
  await Promise.all([tx.objectStore('libros').delete(id), tx.objectStore('avance').delete(id), tx.objectStore('archivos').delete(id), tx.done]);
}

export async function leerAvance(id: string) {
  return (await bd()).get('avance', id);
}

export async function listarAvances(): Promise<Avance[]> {
  return (await bd()).getAll('avance');
}

export async function guardarAvance(avance: Avance) {
  await (await bd()).put('avance', avance);
}

export async function guardarArchivoIdb(id: string, archivo: Blob) {
  await (await bd()).put('archivos', archivo, id);
}

export async function leerArchivoIdb(id: string) {
  return (await bd()).get('archivos', id);
}

export async function listarFrases(): Promise<Frase[]> {
  return (await bd()).getAll('frases');
}

export async function guardarFrase(frase: Frase) {
  await (await bd()).put('frases', frase);
}

export async function borrarFrases(ids: string[]) {
  const db = await bd();
  const tx = db.transaction('frases', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}
