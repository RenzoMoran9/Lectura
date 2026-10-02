// Los temas de la app: los colores de la interfaz (el estante, los menús, las barras). La hoja del
// libro tiene sus propios papeles. Los colores de cada tema están en estilos.css; aquí, lo que se
// muestra al elegirlo y el color de la barra del sistema.

import type { Tema } from '../estado/ajustes';

export const TEMAS: { id: Tema; nombre: string; nota: string; ui: string; tarjeta: string; tinta: string; acento: string }[] = [
  { id: 'papel', nombre: 'Papel', nota: 'Cálido, como un libro', ui: '#F4EEE2', tarjeta: '#FBF7EF', tinta: '#2A2520', acento: '#8E2F2A' },
  { id: 'salvia', nombre: 'Salvia', nota: 'Claro y sereno', ui: '#ECF0E8', tarjeta: '#F7F9F4', tinta: '#1F2B25', acento: '#3D7358' },
  { id: 'penumbra', nombre: 'Penumbra', nota: 'Oscuro, para la noche', ui: '#1B1815', tarjeta: '#2A2520', tinta: '#ECE3D3', acento: '#D9826A' },
];

/** Pone el tema en la página (y el color de la barra del sistema). */
export function aplicarTema(tema: Tema) {
  const t = TEMAS.find((x) => x.id === tema) ?? TEMAS[0];
  document.documentElement.dataset.tema = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.ui);
}
