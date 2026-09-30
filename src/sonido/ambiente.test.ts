import { describe, expect, it } from 'vitest';
import { unirEnBucle } from './ambiente';

// Un «AudioBuffer» mínimo para probar la mezcla sin navegador.
function buffer(canales: Float32Array[], sampleRate = 100) {
  return { sampleRate, length: canales[0].length, numberOfChannels: canales.length, getChannelData: (c: number) => canales[c] } as unknown as AudioBuffer;
}
const ctx = { createBuffer: (n: number, largo: number, sr: number) => buffer(Array.from({ length: n }, () => new Float32Array(largo)), sr) } as unknown as BaseAudioContext;

describe('sonido de fondo: el bucle', () => {
  it('une dos grabaciones con fundidos y el bucle no tiene saltos', () => {
    const a = new Float32Array(1000).fill(1);
    const b = new Float32Array(1000).fill(1);
    const bucle = unirEnBucle(ctx, [buffer([a, a]), buffer([b, b])], 1); // cruce de 100 muestras
    expect(bucle.length).toBe(1800);
    const d = bucle.getChannelData(0);
    // Con dos señales iguales, el fundido de igual potencia nunca baja de 1 ni pasa de √2.
    for (let i = 0; i < d.length; i++) {
      expect(d[i]).toBeGreaterThanOrEqual(0.999);
      expect(d[i]).toBeLessThanOrEqual(1.4143);
    }
  });

  it('cada parte suena en su lugar: A, el cruce, B y el cruce de vuelta a A', () => {
    const a = new Float32Array(1000).fill(1);
    const b = new Float32Array(1000).fill(-1);
    const d = unirEnBucle(ctx, [buffer([a]), buffer([b])], 1).getChannelData(0);
    expect(d[0]).toBeCloseTo(1); // A
    expect(d[850]).toBeLessThan(0.1); // A se va y entra B
    expect(d[1200]).toBeCloseTo(-1); // B
    expect(d[1799]).toBeGreaterThan(0.9); // al final, casi solo A: vuelve al comienzo sin salto
  });
});
