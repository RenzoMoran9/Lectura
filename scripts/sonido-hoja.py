"""Arma el sonido de la hoja a partir de grabaciones reales de un libro (CC0).

Fuente: «RPG Audio» de Kenney (https://kenney.nl/assets/rpg-audio, licencia CC0 1.0):
bookFlip1.ogg, bookFlip2.ogg y bookFlip3.ogg, decodificados a WAV mono de 44,1 kHz.

De cada hoja que pasa se toman tres momentos:
  - toma:    el chasquido corto cuando el dedo levanta la esquina;
  - aire:    el roce suave mientras la hoja cruza (se usa en granos, según la velocidad);
  - asiento: la hoja que se posa sobre las otras.

Uso: python3 scripts/sonido-hoja.py carpeta-con-los-wav public/sonidos
Necesita numpy y scipy. Escribe hoja.wav (todos los trozos seguidos, con silencio entre ellos)
y hoja.json (dónde empieza y termina cada trozo, en segundos).
"""

import json
import sys
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
# Trozos de cada grabación, en milisegundos (medidos sobre la envolvente de 5 ms).
TROZOS = {
    # (El comienzo de bookFlip1 es un golpe grave de la mano, no del papel: no entra.)
    'toma': [('rpg__bookFlip2', 30, 62), ('rpg__bookFlip3', 25, 52)],
    'aire': [('rpg__bookFlip1', 288, 584), ('rpg__bookFlip2', 55, 338), ('rpg__bookFlip3', 54, 177)],
    'asiento': [('rpg__bookFlip1', 584, 735), ('rpg__bookFlip2', 338, 430), ('rpg__bookFlip3', 175, 236)],
}
NIVEL_AIRE = -22.0  # dBFS RMS: todos los trozos de aire suenan parejo
PICO = -1.0  # dBFS: toma y asiento
SILENCIO = 0.03


def leer(carpeta: Path, nombre: str) -> np.ndarray:
    sr, d = wavfile.read(carpeta / f'{nombre}.wav')
    assert sr == SR, f'{nombre}: {sr} Hz'
    d = d.astype(np.float64)
    # Sin el retumbo de la mesa ni el viento del micrófono.
    sos = signal.butter(2, 140, 'hp', fs=SR, output='sos')
    return signal.sosfiltfilt(sos, d)


def recortar(d: np.ndarray, desde_ms: float, hasta_ms: float, fundido_ms=(2.0, 6.0)) -> np.ndarray:
    x = d[int(desde_ms * SR / 1000) : int(hasta_ms * SR / 1000)].copy()
    a = int(fundido_ms[0] * SR / 1000)
    b = int(fundido_ms[1] * SR / 1000)
    x[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    x[-b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x


def db(x):
    return 20 * np.log10(max(x, 1e-12))


def domar(x: np.ndarray, sobre_db=11.0) -> np.ndarray:
    """Baja los chasquidos sueltos del aire (más de `sobre_db` sobre su nivel medio): repetidos en
    los granos sonarían como clics. Los crujidos se agregan aparte, con su propio azar."""
    rms = np.sqrt(np.mean(x**2))
    techo = rms * 10 ** (sobre_db / 20)
    w = int(0.002 * SR)
    env = np.array([np.max(np.abs(x[max(0, i - w) : i + w])) for i in range(len(x))])
    g = np.minimum(1.0, techo / np.maximum(env, 1e-12))
    # Ganancia suave: baja en 1 ms y vuelve en 15 ms.
    a = np.exp(-1 / (0.001 * SR))
    r = np.exp(-1 / (0.015 * SR))
    y = np.empty_like(g)
    v = 1.0
    for i, gi in enumerate(g):
        v = a * v + (1 - a) * gi if gi < v else r * v + (1 - r) * gi
        y[i] = v
    return x * y


def main():
    origen = Path(sys.argv[1])
    destino = Path(sys.argv[2])
    cache = {}
    partes = []
    tabla = {}
    t = 0.0
    for tipo, lista in TROZOS.items():
        tabla[tipo] = []
        for nombre, a, b in lista:
            d = cache.setdefault(nombre, leer(origen, nombre))
            x = recortar(d, a, b, (1.0, 4.0) if tipo != 'aire' else (6.0, 8.0))
            if tipo == 'aire':
                x = domar(x)
                x *= 10 ** ((NIVEL_AIRE - db(np.sqrt(np.mean(x**2)))) / 20)
            else:
                x *= 10 ** ((PICO - db(np.max(np.abs(x)))) / 20)
            tabla[tipo].append([round(t, 4), round(t + len(x) / SR, 4)])
            partes += [x, np.zeros(int(SILENCIO * SR))]
            t += len(x) / SR + SILENCIO
            print(f'{tipo:8s} {nombre:15s} {len(x) / SR * 1000:5.0f} ms  pico {db(np.max(np.abs(x))):6.1f} dBFS  rms {db(np.sqrt(np.mean(x**2))):6.1f} dBFS')
    todo = np.concatenate(partes)
    todo = np.clip(todo, -1, 1)
    wavfile.write(destino / 'hoja.wav', SR, (todo * 32767).astype(np.int16))
    (destino / 'hoja.json').write_text(json.dumps(tabla) + '\n')
    print(f'hoja.wav: {len(todo) / SR:.2f} s · {(destino / "hoja.wav").stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
