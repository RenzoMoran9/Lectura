import { describe, expect, it } from 'vitest';
import { avance, calcularDoblez, doblarPunto, pasaLaHoja, posicionPasada, radioMaximo, restringir } from './geometria';
import { densidad, disponer, esCelular, pliego } from './maqueta';
import { acercarEn, aLienzo, desplazable, encuadrar, limitar, zoomAlTexto } from './zoom';

const W = 390;
const H = 844;
const R = radioMaximo(W, H);
const cerca = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('la hoja sigue al dedo', () => {
  it('el punto que tomó el dedo cae exactamente bajo el dedo', () => {
    const P = { x: 360, y: 80 };
    for (const dedo of [
      { x: 350, y: 82 },
      { x: 300, y: 120 },
      { x: 200, y: 160 },
      { x: 60, y: 200 },
      { x: 5, y: 90 },
    ]) {
      const F = restringir(P, dedo, H);
      const doblado = doblarPunto(P, calcularDoblez(P, F, H, R));
      cerca(doblado.x, F.x);
      cerca(doblado.y, F.y);
    }
  });

  it('sin moverse, la hoja está plana', () => {
    const P = { x: 300, y: 300 };
    expect(calcularDoblez(P, P, H, R)).toBeNull();
  });

  it('no se puede arrastrar hacia la derecha de donde se tomó', () => {
    const P = { x: 300, y: 300 };
    const F = restringir(P, { x: 380, y: 300 }, H);
    expect(F.x).toBeLessThanOrEqual(P.x);
  });

  it('la hoja no se despega del lomo: sus extremos se quedan en su sitio', () => {
    const P = { x: 370, y: 40 };
    for (const dedo of [
      { x: -500, y: 900 },
      { x: -300, y: -400 },
      { x: 10, y: 800 },
      { x: 100, y: -200 },
    ]) {
      const F = restringir(P, dedo, H);
      const dob = calcularDoblez(P, F, H, R);
      for (const s of [
        { x: 0, y: 0 },
        { x: 0, y: H },
      ]) {
        const q = doblarPunto(s, dob);
        cerca(q.x, s.x, 0.5);
        cerca(q.y, s.y, 0.5);
        expect(q.z).toBeLessThan(0.7);
      }
    }
  });

  it('el rollo nunca se hace más grande que el radio máximo', () => {
    const P = { x: 370, y: 40 };
    const dob = calcularDoblez(P, restringir(P, { x: 150, y: 90 }, H), H, R)!;
    expect(dob.r).toBeGreaterThan(0);
    expect(dob.r).toBeLessThanOrEqual(R);
  });

  it('pasada del todo, la hoja queda plana del otro lado del lomo', () => {
    const P = { x: 370, y: 40 };
    const F = restringir(P, posicionPasada(P), H);
    const dob = calcularDoblez(P, F, H, R)!;
    cerca(dob.r, 0, 1e-6);
    const esquina = doblarPunto({ x: W, y: H }, dob);
    cerca(esquina.x, -W, 0.5);
  });
});

describe('zoom', () => {
  const libro = { x: 0, y: 0, w: 390, h: 844 };
  const vista = { w: 390, h: 844 };

  it('acercar deja quieto el punto bajo los dedos', () => {
    const z = acercarEn({ z: 1, x: 0, y: 0 }, 2.5, 100, 300);
    const p = aLienzo(z, 100, 300);
    cerca(p.x, 100);
    cerca(p.y, 300);
  });

  it('no se aleja más que el tamaño normal ni deja ver fuera de la página', () => {
    expect(limitar({ z: 0.5, x: 40, y: 40 }, libro, vista)).toEqual({ z: 1, x: 0, y: 0 });
    const z = limitar({ z: 2, x: 50, y: -5000 }, libro, vista);
    expect(z.x).toBe(0); // no se ve nada a la izquierda de la hoja
    expect(z.y).toBe(844 - 2 * 844); // ni debajo
    expect(limitar({ z: 9, x: 0, y: 0 }, libro, vista).z).toBe(5);
  });

  it('un libro más chico que la pantalla queda centrado aunque tenga zoom', () => {
    const mesa = { x: 500, y: 100, w: 400, h: 600 };
    const z = limitar({ z: 1.2, x: 0, y: 0 }, mesa, { w: 1400, h: 900 });
    const centro = z.x + z.z * (mesa.x + mesa.w / 2);
    cerca(centro, 700);
  });

  it('ajustar al texto: el texto ocupa todo el ancho, sin cortar nada', () => {
    const e = { texto: { x: 40, y: 200, w: 310, h: 420 }, ancho: 310, margen: { lado: 10, arriba: 20, abajo: 20 } };
    const z = zoomAlTexto(e, vista);
    const q = encuadrar(z, e, vista, 'arriba');
    cerca(q.x + z * e.texto.x, 10, 0.5); // borde izquierdo del texto
    cerca(q.x + z * (e.texto.x + e.texto.w), 380, 0.5); // borde derecho
    // Cabe a lo alto: queda centrado.
    cerca(q.y + z * (e.texto.y + e.texto.h / 2), 422, 0.5);
  });

  it('ajustar al texto: si no cabe a lo alto, empieza arriba al avanzar y abajo al volver', () => {
    const e = { texto: { x: 20, y: 40, w: 800, h: 1000 }, ancho: 800, margen: { lado: 10, arriba: 16, abajo: 16 } };
    const v = { w: 844, h: 390 };
    const z = zoomAlTexto(e, v);
    cerca(encuadrar(z, e, v, 'arriba').y + z * 40, 16, 0.5);
    cerca(encuadrar(z, e, v, 'abajo').y + z * 1040, 390 - 16, 0.5);
  });

  it('de lado, sin zoom, la hoja alta se puede deslizar', () => {
    const d = disponer(844, 390, { arriba: 0, abajo: 21, izquierda: 47, derecha: 47 }, 0.77);
    expect(desplazable({ z: 1, x: 0, y: 0 }, d.libro, { w: 844, h: 390 })).toBe(true);
    expect(desplazable({ z: 1, x: 0, y: 0 }, libro, vista)).toBe(false);
  });

  it('en doble página se pasa pasada la mitad: el lomo', () => {
    const P = { x: 380, y: 80 };
    expect(pasaLaHoja(avance('adelante', P, { x: 20, y: 80 }, true))).toBe(false);
    expect(pasaLaHoja(avance('adelante', P, { x: -20, y: 80 }, true))).toBe(true);
  });
});

describe('antes de la mitad regresa; pasada la mitad, cae', () => {
  it('adelante: cuenta el recorrido del dedo hasta el borde', () => {
    const P = { x: 360, y: 80 };
    expect(pasaLaHoja(avance('adelante', P, { x: 250, y: 80 }))).toBe(false);
    expect(pasaLaHoja(avance('adelante', P, { x: 185, y: 80 }))).toBe(false);
    expect(pasaLaHoja(avance('adelante', P, { x: 175, y: 80 }))).toBe(true);
    expect(pasaLaHoja(avance('adelante', P, { x: 20, y: 80 }))).toBe(true);
  });

  it('atrás: la hoja anterior tiene que volver más de la mitad', () => {
    const P = { x: W, y: 80 };
    expect(avance('atras', P, posicionPasada(P))).toBe(0);
    expect(pasaLaHoja(avance('atras', P, { x: -20, y: 80 }))).toBe(false);
    expect(pasaLaHoja(avance('atras', P, { x: 20, y: 80 }))).toBe(true);
    expect(avance('atras', P, P)).toBe(1);
  });
});

describe('disposición en pantalla', () => {
  it('en el celular la hoja ocupa toda la pantalla y la página cabe entera', () => {
    const d = disponer(W, H, { arriba: 47, abajo: 34, izquierda: 0, derecha: 0 }, 0.7);
    expect(d.modo).toBe('celular');
    expect(d.hoja).toEqual({ x: 0, y: 0, w: W, h: H });
    expect(d.caja.y).toBeGreaterThanOrEqual(47);
    expect(d.caja.y + d.caja.h).toBeLessThanOrEqual(H - 34);
  });

  it('en pantalla ancha el libro se abre a doble página, centrado y con el lomo al medio', () => {
    const d = disponer(1440, 900, { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 }, 0.7, { barraArriba: 52, barraAbajo: 56 });
    expect(d.modo).toBe('doble');
    cerca(d.caja.w / d.caja.h, 0.7, 0.01);
    expect(d.libro.w).toBe(2 * d.hoja.w);
    cerca(d.hoja.x, 720, 1); // el lomo
    expect(d.libro.y).toBeGreaterThanOrEqual(52);
    expect(d.libro.y + d.libro.h).toBeLessThanOrEqual(900 - 56);
  });

  it('una tablet en vertical se lee como el celular, a pantalla completa', () => {
    expect(disponer(820, 1180, { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 }, 0.7).modo).toBe('celular');
  });

  it('una ventana casi cuadrada y angosta muestra una sola página sobre la mesa', () => {
    const d = disponer(650, 680, { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 }, 0.7, { barraArriba: 52, barraAbajo: 56 });
    expect(d.modo).toBe('mesa');
    cerca(d.hoja.x + d.hoja.w / 2, 325, 1);
  });

  it('el celular de lado: una página a todo el ancho, más alta que la pantalla', () => {
    const d = disponer(844, 390, { arriba: 0, abajo: 21, izquierda: 47, derecha: 47 }, 0.77);
    expect(d.modo).toBe('celular');
    expect(d.caja.w).toBe(844 - 12 - 94);
    cerca(d.caja.h, d.caja.w / 0.77, 1);
    expect(d.hoja.h).toBeGreaterThan(390);
    expect(esCelular(1180, 820)).toBe(false); // la tablet de lado sigue a doble página
  });

  it('los pliegos: la portada sola a la derecha y luego de a dos', () => {
    expect(pliego(0)).toEqual({ izquierda: -1, derecha: 0 });
    expect(pliego(1)).toEqual({ izquierda: 1, derecha: 2 });
    expect(pliego(2)).toEqual({ izquierda: 1, derecha: 2 });
    expect(pliego(7)).toEqual({ izquierda: 7, derecha: 8 });
  });

  it('la densidad no pasa del límite de memoria', () => {
    const dpr = densidad(3, 1024, 1366);
    expect(1024 * 1366 * dpr * dpr).toBeLessThanOrEqual(3.2e6 + 1);
    expect(densidad(2, 390, 844)).toBe(2);
  });
});
