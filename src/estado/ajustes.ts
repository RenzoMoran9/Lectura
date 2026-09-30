// Ajustes de lectura: papel y sonido. Pesan poco, así que van en localStorage.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TipoPapel } from '../hoja/papel';
import type { JuegoSonido } from '../sonido/sonido';

export interface Ajustes {
  papel: TipoPapel;
  sonido: boolean;
  volumen: number; // 0..1
  juego: JuegoSonido;
  poner: (cambios: Partial<Omit<Ajustes, 'poner'>>) => void;
}

export const useAjustes = create<Ajustes>()(
  persist(
    (set) => ({
      papel: 'crema',
      sonido: true,
      volumen: 0.7,
      juego: 'nuevo',
      poner: (cambios) => set(cambios),
    }),
    { name: 'entre-hojas:ajustes', version: 1 },
  ),
);
