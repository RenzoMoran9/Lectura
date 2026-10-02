# Voces propias de Entre Hojas

Lucía, Elena, Mateo y Andrés son cuatro de las voces de **Supertonic 3** (Supertone Inc., 2026), un
modelo de voz que funciona en el teléfono, sin internet. Corresponden a los estilos F1, F3, M4 y M5
del modelo.

- **Modelo:** Supertonic 3, licencia **BigScience Open RAIL-M** (copia completa en
  `LICENSE-OpenRAIL-M.txt`). Esa licencia trae **restricciones de uso** (párrafo 5 y anexo A) que
  valen para cualquiera que use estos archivos. Entre Hojas solo los usa para leer en voz alta los
  libros de quien usa la app, en su propio dispositivo.
- **Archivos:** la versión int8 que publica sherpa-onnx (Apache-2.0),
  `sherpa-onnx-supertonic-3-tts-int8-2026-05-11`, sin cambios. No están en el repositorio:
  `scripts/voces.mjs` los baja al publicar (y verifica su huella SHA-256) a `voces/supertonic/`,
  junto con su `LICENSE` (MIT, el código de ejemplo de Supertone).
- **Código:** los pasos de `src/lectura/supertonic.ts` siguen el ejemplo web oficial de Supertonic
  (licencia MIT). El motor es ONNX Runtime Web (MIT, Microsoft), copiado a `ort/`.
- **Elección de las voces:** se generó el mismo párrafo con las 10 voces y se transcribió con Whisper;
  estas cuatro se entendieron sin errores.

Lo que dicen estas voces es audio generado por una máquina, a partir del texto del libro.
