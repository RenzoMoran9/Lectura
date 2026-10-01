// Ajustes de lectura: papel y sonido. Pesan poco, así que van en localStorage.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ColorLapiz, ColorResaltador } from '../frases/modelo';
import type { Marco } from '../frases/tarjeta';
import type { TipoPapel } from '../hoja/papel';
import type { JuegoSonido } from '../sonido/sonido';

export interface Ajustes {
  papel: TipoPapel;
  sonido: boolean;
  volumen: number; // 0..1
  juego: JuegoSonido;
  colorResaltador: ColorResaltador;
  colorLapiz: ColorLapiz;
  /** Dónde está el botón de la esquina: el borde y la altura (0 arriba, 1 abajo). */
  boton: { lado: 'izq' | 'der'; y: number };
  /** Panel lateral con Mis frases del libro (pantallas anchas). */
  panelFrases: boolean;
  /** Volumen del sonido de fondo (playa, lluvia, terror…), 0..1. */
  volumenAmbiente: number;
  /** Luz del papel: sola según la hora, o a mano con brillo (0.6..1) y tibieza (0..1). */
  luzAuto: boolean;
  brillo: number;
  tibieza: number;
  /** Días seguidos haciendo el repaso del día. */
  racha?: { dia: string; dias: number };
  /** El último marco elegido para compartir una frase. */
  marco?: Marco;
  /** Lectura en voz alta: la voz elegida (nombre) y la velocidad. */
  voz?: string;
  /** Ya se avisó de las voces propias (Lucía, Elena, Mateo y Andrés). */
  avisoVoces?: boolean;
  velocidadVoz: number;
  /** Leer con el texto a todo el ancho de la pantalla (doble toque para cambiar). */
  ajusteTexto: boolean;
  /** Buscar sola la portada original de cada libro en Open Library y Google Books. */
  portadasEnLinea: boolean;
  /** Ya no mostrar el aviso de cómo instalar la app en el iPhone. */
  sinAvisoInstalar: boolean;
  /** «A tu medida»: en el celular de pie, los renglones acomodados al ancho de la pantalla. */
  vistaMedida: boolean;
  /** Alto del renglón en «A tu medida» (px). */
  letraMedida: number;
  poner: (cambios: Partial<Omit<Ajustes, 'poner'>>) => void;
}

export const useAjustes = create<Ajustes>()(
  persist(
    (set) => ({
      papel: 'crema',
      sonido: true,
      volumen: 0.7,
      juego: 'nuevo',
      colorResaltador: 'amarillo',
      colorLapiz: 'grafito',
      boton: { lado: 'der', y: 1 },
      panelFrases: true,
      volumenAmbiente: 0.6,
      ajusteTexto: false,
      velocidadVoz: 1,
      luzAuto: true,
      brillo: 1,
      tibieza: 0,
      portadasEnLinea: true,
      sinAvisoInstalar: false,
      vistaMedida: false,
      letraMedida: 20,
      poner: (cambios) => set(cambios),
    }),
    { name: 'entre-hojas:ajustes', version: 1 },
  ),
);
