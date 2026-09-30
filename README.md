# Hoja a hoja — lector de libros en PDF

Un lector de libros en PDF que se siente como un libro de papel: la hoja se curva y sigue tu dedo, suena a papel,
puedes elegir el tipo de papel (blanco, crema, antiguo o noche), resaltar o encerrar frases a lápiz y guardarlas en
«Mis frases» para repasarlas. Recuerda dónde te quedaste. Se abrirá con un enlace en el celular y en la computadora.

La visión completa, el diseño y las decisiones técnicas están en [`CLAUDE.md`](./CLAUDE.md).

## Estado

| Etapa | Qué incluye | Estado |
| --- | --- | --- |
| 0 | Propuesta visual (maqueta e imágenes) | ✅ hecha |
| 1 | Subir PDF, pasar la hoja con el dedo (curva + sonido), 4 papeles, recordar la página | ⏳ |
| 2 | Menú de la esquina: resaltador, lápiz para encerrar, borrador y «Mis frases» | ⏳ |
| 3 | Estante con varios libros, doble página en la PC, instalar en el celular, sin internet | ⏳ |
| 4 | Inicio de sesión y sincronización entre celular y PC (Supabase) | ⏳ |

## Propuesta visual

![Celular: estante, pasar la hoja y menú de la esquina](diseno/propuesta-1-celular.jpg)
![Celular: papel y sonido, Mis frases y materiales](diseno/propuesta-2-celular.jpg)
![Computadora: libro abierto a doble página](diseno/propuesta-3-computadora.jpg)

La maqueta es `diseno/propuesta-visual.html` (ábrela en el navegador). Para volver a generar las imágenes:
`node diseno/render.cjs` (necesita el paquete `playwright`).

## Licencias de terceros

- Fuentes EB Garamond, Fraunces, DM Sans y Caveat (`diseno/fuentes/`): SIL Open Font License 1.1, vía Fontsource.
- Íconos de [Lucide](https://lucide.dev) (`diseno/iconos.js`): licencia ISC.
- Texto de muestra: *Don Quijote de la Mancha*, Miguel de Cervantes (1605), dominio público.
