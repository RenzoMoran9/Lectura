// Márgenes seguros del sistema (muesca, barra de inicio), leídos de CSS env().

export interface Margenes {
  arriba: number;
  abajo: number;
  izquierda: number;
  derecha: number;
}

let sonda: HTMLDivElement | null = null;

export function margenesSeguros(): Margenes {
  if (!sonda) {
    sonda = document.createElement('div');
    sonda.className = 'sonda-segura';
    sonda.setAttribute('aria-hidden', 'true');
    document.body.appendChild(sonda);
  }
  const e = getComputedStyle(sonda);
  const n = (v: string) => parseFloat(v) || 0;
  return { arriba: n(e.paddingTop), abajo: n(e.paddingBottom), izquierda: n(e.paddingLeft), derecha: n(e.paddingRight) };
}
