// Geometría de la hoja que se curva.
//
// La hoja es un rectángulo de ancho W y alto H, con el lomo en el borde izquierdo (x = 0) y el
// origen abajo a la izquierda (y hacia arriba), en píxeles CSS. Para doblarla basta con dos puntos:
//   P: el punto de la hoja que tomó el dedo (en coordenadas de la hoja plana);
//   F: dónde está ahora ese punto (en la pantalla).
// La parte de la hoja que queda «más allá» del doblez se enrolla sobre un cilindro de radio r y,
// pasada media vuelta, sigue plana por encima, del revés. Con esta construcción el punto P cae
// exactamente sobre F: la hoja va pegada al dedo.

export interface Vec {
  x: number;
  y: number;
}

/** Doblez listo para el shader: n apunta hacia la parte que se levanta; a es la posición del eje. */
export interface Doblez {
  nx: number;
  ny: number;
  a: number;
  r: number;
}

export type Sentido = 'adelante' | 'atras';

/** Inclinación máxima del doblez respecto a la vertical (tangente del ángulo). */
const TAN_MAX = 1.5;

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Limita la posición del punto tomado para que la hoja no se «despegue» del lomo:
 * no puede ir a la derecha de donde se tomó, el doblez no se inclina de más y ningún extremo
 * del lomo puede quedar del lado que se levanta.
 */
export function restringir(P: Vec, F: Vec, alto: number): Vec {
  let x = Math.min(F.x, P.x);
  const vx = P.x - x;
  const dyMax = TAN_MAX * vx;
  let y = P.y - Math.max(-dyMax, Math.min(dyMax, P.y - F.y));

  // Discos centrados en los extremos del lomo: la distancia a ellos no puede crecer.
  const extremos: Vec[] = [
    { x: 0, y: 0 },
    { x: 0, y: alto },
  ];
  const radios = extremos.map((s) => dist(P, s));
  for (let i = 0; i < 6; i++) {
    extremos.forEach((s, k) => {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d > radios[k]) {
        x = s.x + ((x - s.x) * radios[k]) / d;
        y = s.y + ((y - s.y) * radios[k]) / d;
      }
    });
  }
  return { x, y };
}

/** Calcula el doblez para que P caiga en F. Devuelve null si la hoja está plana. */
export function calcularDoblez(P: Vec, F: Vec, alto: number, radioMax: number): Doblez | null {
  const vx = P.x - F.x;
  const vy = P.y - F.y;
  const d = Math.hypot(vx, vy);
  if (d < 0.5) return null;
  const nx = vx / d;
  const ny = vy / d;
  // Mediatriz entre P y F: ahí iría un doblez sin grosor.
  const a0 = (P.x * nx + P.y * ny + F.x * nx + F.y * ny) / 2;
  // Lo que queda entre esa mediatriz y el lomo limita el radio: el cilindro nunca cruza el lomo.
  const lomo = Math.max(0, alto * ny);
  const margen = Math.max(0, a0 - lomo);
  const r = Math.max(0, Math.min(radioMax, d / Math.PI, (2 * margen) / Math.PI));
  return { nx, ny, a: a0 - (Math.PI * r) / 2, r };
}

/** Lleva un punto de la hoja plana a su posición doblada (x, y en pantalla; z hacia el lector). */
export function doblarPunto(p: Vec, dob: Doblez | null): { x: number; y: number; z: number } {
  if (!dob) return { x: p.x, y: p.y, z: 0 };
  const { nx, ny, a, r } = dob;
  const d = p.x * nx + p.y * ny - a;
  if (d <= 0) return { x: p.x, y: p.y, z: 0 };
  const bx = p.x - nx * d;
  const by = p.y - ny * d;
  if (r < 0.5) return { x: bx - nx * d, y: by - ny * d, z: 0.6 };
  if (d < Math.PI * r) {
    const t = d / r;
    return { x: bx + nx * r * Math.sin(t), y: by + ny * r * Math.sin(t), z: r * (1 - Math.cos(t)) };
  }
  const resto = d - Math.PI * r;
  return { x: bx - nx * resto, y: by - ny * resto, z: 2 * r };
}

/** Dónde queda el punto tomado cuando la hoja terminó de pasar: reflejado sobre el lomo. */
export const posicionPasada = (P: Vec): Vec => ({ x: -P.x, y: P.y });

/**
 * Cuánto va del recorrido (0 a 1). Solo cuenta la posición, nunca la velocidad:
 *  - adelante, el dedo va desde donde tomó la hoja hasta el borde izquierdo (una página) o hasta
 *    el otro lado del lomo (doble página);
 *  - atrás, la hoja anterior vuelve desde el lomo hasta cubrir la página.
 */
export function avance(sentido: Sentido, P: Vec, F: Vec, doble = false): number {
  // En doble página el recorrido completo es de un lado del lomo al otro: la mitad es el lomo.
  const v = sentido === 'adelante' && !doble ? (P.x - F.x) / Math.max(P.x, 1) : sentido === 'adelante' ? (P.x - F.x) / Math.max(2 * P.x, 1) : (F.x + P.x) / Math.max(2 * P.x, 1);
  return Math.max(0, Math.min(1, v));
}

/** Al soltar: antes de la mitad regresa, pasada la mitad termina de caer. */
export const pasaLaHoja = (progreso: number) => progreso >= 0.5;

/** Radio del rollo según el tamaño de la hoja. */
export const radioMaximo = (ancho: number, alto: number) => Math.max(18, Math.min(ancho, alto) * 0.13);
