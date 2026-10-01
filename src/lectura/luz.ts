// Luz del papel: de noche, más cálida y un poco más tenue, para no cansar la vista (como una
// lámpara de lectura). Se ajusta sola según la hora o a mano con «Brillo» y «Tibieza».

export interface Luz {
  /** 0.6 (tenue) a 1 (normal). */
  brillo: number;
  /** 0 (blanca) a 1 (muy cálida). */
  tibieza: number;
}

const suave = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * La luz de cada hora del día (hora con decimales, 0..24): de día normal; desde las 18 h se
 * entibia poco a poco hasta las 22 h; de madrugada, igual; desde las 5 h vuelve a la del día.
 */
export function luzDeLaHora(hora: number): Luz {
  const noche = hora >= 12 ? suave(18, 22, hora) : 1 - suave(5, 7.5, hora);
  return { brillo: 1 - 0.18 * noche, tibieza: 0.75 * noche };
}

export function luzActual(a: { luzAuto: boolean; brillo: number; tibieza: number }, ahora = new Date()): Luz {
  if (!a.luzAuto) return { brillo: a.brillo, tibieza: a.tibieza };
  return luzDeLaHora(ahora.getHours() + ahora.getMinutes() / 60);
}
