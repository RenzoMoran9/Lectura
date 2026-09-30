// Estado de la app: qué pantalla se ve, los libros guardados y la subida de un PDF nuevo.

import { create } from 'zustand';
import { guardarArchivo, pedirPersistencia, quitarLibro, SinEspacio } from '../datos/archivos';
import { guardarLibro, listarAvances, listarLibros, obtenerLibro, type Avance, type Libro } from '../datos/bd';
import { abrirPdf, cerrarPdf, PdfConClave, PdfDanado, tituloDelPdf } from '../pdf/pdf';
import { dibujarPortada } from '../pdf/paginas';

export type Vista = { pantalla: 'inicio' } | { pantalla: 'lector'; libroId: string };

export interface Subida {
  nombre: string;
  tamano: number;
  escritos: number;
  fase: 'leyendo' | 'guardando';
}

interface EstadoLibros {
  vista: Vista;
  libros: Libro[];
  avances: Record<string, Avance>;
  cargado: boolean;
  subida: Subida | null;
  error: string | null;
  cargar: () => Promise<void>;
  abrir: (libroId: string) => void;
  volver: () => void;
  subir: (archivo: File) => Promise<void>;
  quitar: (libro: Libro) => Promise<void>;
  anotarAvance: (avance: Avance) => void;
  limpiarError: () => void;
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (useLibros.getState().vista.pantalla === 'lector') useLibros.setState({ vista: { pantalla: 'inicio' } });
  });
}

export const useLibros = create<EstadoLibros>()((set, get) => ({
  vista: { pantalla: 'inicio' },
  libros: [],
  avances: {},
  cargado: false,
  subida: null,
  error: null,

  cargar: async () => {
    const [libros, avances] = await Promise.all([listarLibros(), listarAvances()]);
    set({ libros, avances: Object.fromEntries(avances.map((a) => [a.libroId, a])), cargado: true });
  },

  // Abrir un libro deja una entrada en el historial: el botón «atrás» del celular vuelve al estante.
  abrir: (libroId) => {
    history.pushState({ lector: libroId }, '');
    set({ vista: { pantalla: 'lector', libroId } });
  },
  volver: () => {
    if (history.state?.lector) history.back();
    else set({ vista: { pantalla: 'inicio' } });
  },
  limpiarError: () => set({ error: null }),

  anotarAvance: (avance) => set((s) => ({ avances: { ...s.avances, [avance.libroId]: avance } })),

  subir: async (archivo) => {
    if (get().subida) return;
    const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
    if (!esPdf) {
      set({ error: 'Ese archivo no es un PDF.' });
      return;
    }
    set({ subida: { nombre: archivo.name, tamano: archivo.size, escritos: 0, fase: 'leyendo' }, error: null });
    try {
      void pedirPersistencia();
      // Se abre directamente desde el archivo elegido (por partes) para conocer su huella.
      const doc = await abrirPdf(archivo);
      const id = doc.fingerprints[0] ?? `${archivo.name}-${archivo.size}`;
      const existente = await obtenerLibro(id);
      if (existente) {
        cerrarPdf(doc);
        set({ subida: null });
        await get().cargar();
        get().abrir(id);
        return;
      }
      const [{ titulo, autor }, portada] = await Promise.all([tituloDelPdf(doc, archivo.name), dibujarPortada(doc)]);
      const paginas = doc.numPages;
      cerrarPdf(doc);
      set((s) => ({ subida: s.subida && { ...s.subida, fase: 'guardando' } }));
      const almacen = await guardarArchivo(id, archivo, (escritos) =>
        set((s) => ({ subida: s.subida && { ...s.subida, escritos } })),
      );
      const libro: Libro = {
        id,
        titulo,
        autor,
        nombreArchivo: archivo.name,
        tamano: archivo.size,
        paginas,
        almacen,
        agregado: Date.now(),
        portada,
      };
      await guardarLibro(libro);
      set({ subida: null });
      await get().cargar();
      get().abrir(id);
    } catch (e) {
      console.error(e);
      let error = 'No se pudo abrir este PDF.';
      if (e instanceof SinEspacio) error = 'No hay espacio suficiente en este dispositivo para guardar el libro.';
      else if (e instanceof PdfConClave) error = 'Este PDF tiene contraseña; por ahora no se puede abrir.';
      else if (e instanceof PdfDanado) error = 'Este archivo no parece un PDF válido.';
      set({ subida: null, error });
    }
  },

  quitar: async (libro) => {
    await quitarLibro(libro.id, libro.almacen);
    await get().cargar();
  },
}));
