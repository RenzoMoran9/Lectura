// Repaso del día (tipo tarjetas): unas pocas frases al día para no olvidarlas. Las que recuerdo
// vuelven cada vez más espaciadas (1, 3, 7, 14, 30 y 60 días); las que no, vuelven mañana.

import type { Frase } from './modelo';

const DIA = 864e5;
/** Días hasta el próximo repaso según la caja (0 = recién guardada o olvidada). */
export const INTERVALOS = [1, 3, 7, 14, 30, 60];
export const POR_DIA = 10;

export const inicioDelDia = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Fecha local «AAAA-MM-DD» (para la racha). */
export const diaDe = (t: number) => new Date(t).toLocaleDateString('en-CA');

/** ¿Le toca hoy? Las nuevas, desde el día siguiente a guardarlas. */
export function tocaHoy(f: Frase, ahora: number): boolean {
  if (!f.texto && !f.imagen) return false;
  const finDeHoy = inicioDelDia(ahora) + DIA;
  if (f.repaso) return f.repaso.proxima < finDeHoy;
  return f.creada < inicioDelDia(ahora);
}

/** Las frases del repaso de hoy: primero las que ya tocaban (las más atrasadas), luego las nuevas. */
export function delDia(frases: Frase[], ahora: number, max = POR_DIA): Frase[] {
  const tocan = frases.filter((f) => tocaHoy(f, ahora));
  const atrasadas = tocan.filter((f) => f.repaso).sort((a, b) => a.repaso!.proxima - b.repaso!.proxima);
  const nuevas = tocan.filter((f) => !f.repaso).sort((a, b) => a.creada - b.creada);
  return [...atrasadas, ...nuevas].slice(0, max);
}

/** Después de verla: si la recordaba, sube de caja y vuelve más tarde; si no, vuelve mañana. */
export function responder(f: Frase, recordaba: boolean, ahora: number): NonNullable<Frase['repaso']> {
  const caja = recordaba ? Math.min(INTERVALOS.length - 1, (f.repaso?.caja ?? 0) + 1) : 0;
  return { caja, proxima: inicioDelDia(ahora) + INTERVALOS[caja] * DIA };
}

/** Días seguidos repasando: sigue si ayer también repasé; si no, empieza de nuevo. */
export function sumarRacha(r: { dia: string; dias: number } | undefined, ahora: number) {
  const hoy = diaDe(ahora);
  if (r?.dia === hoy) return r;
  const ayer = diaDe(inicioDelDia(ahora) - DIA / 2);
  return { dia: hoy, dias: r?.dia === ayer ? r.dias + 1 : 1 };
}
