// Mis frases: se cargan todas al abrir la app (pesan poco) y se guardan en IndexedDB al momento.

import { create } from 'zustand';
import { borrarFrases, guardarFrase, listarFrases } from '../datos/bd';
import type { Frase, Herramienta } from '../frases/modelo';

interface EstadoFrases {
  frases: Frase[];
  cargadas: boolean;
  /** Herramienta activa en el lector: con ella el dedo marca y la hoja no se pasa. */
  herramienta: Herramienta | null;
  cargar: () => Promise<void>;
  agregar: (f: Frase) => Promise<void>;
  quitar: (ids: string[]) => Promise<Frase[]>;
  restaurar: (fs: Frase[]) => Promise<void>;
  usar: (h: Herramienta | null) => void;
}

export const useFrases = create<EstadoFrases>()((set, get) => ({
  frases: [],
  cargadas: false,
  herramienta: null,

  cargar: async () => {
    const frases = await listarFrases();
    set({ frases, cargadas: true });
  },

  agregar: async (f) => {
    set((s) => ({ frases: [...s.frases, f] }));
    await guardarFrase(f);
  },

  quitar: async (ids) => {
    const quitadas = get().frases.filter((f) => ids.includes(f.id));
    set((s) => ({ frases: s.frases.filter((f) => !ids.includes(f.id)) }));
    await borrarFrases(ids);
    return quitadas;
  },

  restaurar: async (fs) => {
    set((s) => ({ frases: [...s.frases, ...fs] }));
    await Promise.all(fs.map(guardarFrase));
  },

  usar: (herramienta) => set({ herramienta }),
}));
