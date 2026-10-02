# Sonidos de Entre Hojas

## La hoja: grabaciones reales (CC0)

`hoja.wav` y `hoja.json` salen de grabaciones reales de un libro: `bookFlip1.ogg`, `bookFlip2.ogg`
y `bookFlip3.ogg` del paquete **RPG Audio** de **Kenney** (https://kenney.nl/assets/rpg-audio),
con licencia **Creative Commons CC0 1.0** (dominio público: se pueden usar y modificar sin pedir
permiso ni nombrar al autor; lo nombramos por cortesía).

Se recortaron con `scripts/sonido-hoja.py` en tres momentos de la hoja: la **toma** (el dedo
levanta la esquina), el **aire** (el roce mientras cruza; se le bajaron los chasquidos sueltos) y el
**asiento** (la hoja se posa). `hoja.json` dice dónde está cada trozo dentro de `hoja.wav`. La app los
toca en granos según la velocidad de la hoja (`src/sonido/sonido.ts`).

## Al marcar: generados con ElevenLabs

Efectos generados para este proyecto con ElevenLabs (Sound Effects, modelo
`eleven_text_to_sound_v2`) desde la cuenta del proyecto, con plan de pago. Su uso se rige por los
términos de servicio de ElevenLabs para contenido generado. No son grabaciones de terceros.

| Archivo | Qué es |
| --- | --- |
| `lapiz-1.mp3`, `lapiz-2.mp3` | lápiz de grafito sobre el papel (al encerrar, en bucle) |
| `resaltador-1.mp3` | resaltador que se desliza sobre el papel (en bucle) |
| `borrador-1.mp3` | goma de borrar sobre el papel (en bucle) |
