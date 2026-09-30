# Entre Hojas — lector de libros en PDF

Un lector de libros en PDF que se siente como un libro de papel: la hoja se curva y sigue tu dedo, suena a papel,
puedes elegir el tipo de papel (blanco, crema, antiguo o noche), resaltar o encerrar frases a lápiz y guardarlas en
«Mis frases» para repasarlas. Recuerda dónde te quedaste. Se abrirá con un enlace en el celular y en la computadora.

La visión completa, el diseño y las decisiones técnicas están en [`CLAUDE.md`](./CLAUDE.md).

## Estado

| Etapa | Qué incluye | Estado |
| --- | --- | --- |
| 0 | Propuesta visual (maqueta e imágenes) | ✅ hecha |
| 1 | Subir PDF, pasar la hoja con el dedo (curva + sonido), 4 papeles, recordar la página | ✅ hecha |
| 2 | Menú de la esquina: resaltador, lápiz para encerrar, borrador y «Mis frases» | ✅ hecha |
| 3 | Estante con varios libros, portadas de internet, zoom, doble página en la PC, instalar en el celular, sin internet | ✅ hecha |
| 4 | Inicio de sesión y sincronización entre celular y PC (Supabase) | ⏳ |

**La app:** https://renzomoran9.github.io/Lectura/

## Etapa 1: cómo funciona

- **Subir un PDF de cualquier tamaño.** Se guarda tal cual en el navegador (OPFS; si no hay, IndexedDB)
  y se pide almacenamiento persistente. PDF.js lo lee por partes (rangos de 64 KB) desde el archivo
  guardado, así que nunca se carga entero. Con libros enormes, el documento se vuelve a abrir cada
  ~160 MB leídos para soltar la memoria que PDF.js acumula.
- **La hoja** (`src/hoja/`) es WebGL propio: una malla que se enrolla sobre un cilindro. Hacia adelante,
  el punto que tomas va pegado al dedo; hacia atrás, la hoja anterior vuelve desde el lomo. Al soltar
  solo cuenta la posición: antes de la mitad del recorrido regresa, pasada la mitad cae. Tiene luz,
  sombra sobre la página de abajo y reverso con el texto al revés, apenas visible.
- **Sonido** (`src/sonido/`): un roce en bucle cuyo volumen y brillo siguen la velocidad de la hoja, y un
  golpecito al asentarse. Dos juegos: «libro nuevo» y «libro antiguo».
- **Papel**: la página del PDF se multiplica con una textura de ruido (`feTurbulence`); en «noche» se
  invierte la luz con un tono cálido. El PDF nunca se modifica.
- **Recordar la página**: el avance de cada libro se guarda en IndexedDB y el libro se abre ahí.

## Etapa 2: cómo funciona

- **Menú de la esquina** (`src/ui/MenuEsquina.tsx`): botón chico y semitransparente; se arrastra a cualquier borde
  y recuerda dónde quedó. Se abre en abanico hacia adentro con resaltador (5 colores), lápiz (grafito o rojo),
  borrador, papel y Mis frases. Con una herramienta activa aparece arriba «Resaltando · la hoja no se pasa · Listo».
- **Resaltar** (`src/frases/`): se lee la capa de texto de PDF.js y se calcula la caja de cada letra; al arrastrar,
  la selección se ajusta a palabras completas, aunque ocupe varios renglones (y quita el guion de las palabras cortadas).
- **Encerrar a lápiz**: el círculo se dibuja a mano y queda tal cual; se guardan las palabras que quedaron dentro.
- **Escaneados**: sin texto, el resaltador deja una banda a mano y la frase se guarda como recorte de la página.
- **Las marcas van en el papel**: se dibujan en una capa blanca que el shader multiplica con la página, así se curvan
  con la hoja, se ven en su reverso y funcionan en los 4 papeles (en «noche» se invierten con la página).
- **Borrador** con «Deshacer». **Mis frases** (IndexedDB): texto, libro, página, fecha y color; buscador, filtros por
  libro y color, «Ir a la página» y «Repasar» (frases al azar). Si quitas un libro, sus frases se conservan.

## Etapa 3: cómo funciona

- **Estante** (`src/ui/Inicio.tsx`): «Seguir leyendo» con el capítulo (del índice del PDF) y la página, «Para recordar
  hoy» (una frase guardada distinta cada día; al tocarla te lleva a su página), los libros con portada y avance
  («Nuevo», «23 %», «Leído ✓»), buscador y pestañas «Estante» y «Mis frases».
- **Portadas originales** (`src/portadas/`): al subir un libro se busca su portada en Open Library y Google Books por
  título y autor. Solo se pone sola si coincide con seguridad; se descarga y se guarda en el dispositivo (o, si el sitio
  no deja leerla, en la caché del navegador), así se ve sin internet. En el «⋯» de cada libro se corrigen el título y el
  autor, se vuelve a buscar y se elige: la primera página del PDF, otra de internet o una «de tela» hecha por la app.
  Para buscarlas se envían a esos catálogos solo el título y el autor del libro; se puede apagar en la misma ficha.
- **Zoom** (`src/hoja/gestos.ts`, `src/hoja/zoom.ts`): pellizco con dos dedos, un dedo mueve la hoja ampliada, doble
  toque acerca o vuelve al tamaño normal. En la PC, Ctrl + rueda (hacia el puntero), la rueda sola mueve, y Ctrl + / − / 0.
  Al quedarse quieto, la parte visible se vuelve a dibujar nítida a la nueva escala.
- **Doble página** en la PC o la tablet en horizontal: el libro abierto sobre la mesa; se toma la esquina con el mouse
  (o ← →); el reverso de la hoja es la página siguiente de verdad. Barra de arriba con título y capítulo, barra de abajo
  para saltar de página y panel lateral con las frases del libro.
- **Instalable y sin internet** (`src/pwa/`, `scripts/pwa.mjs`): manifiesto con íconos propios
  (`node scripts/generar-iconos.cjs`) y un service worker que guarda toda la app al abrirla la primera vez. Cuando
  se publica una versión nueva aparece «Hay una versión nueva · Actualizar».

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173/Lectura/
npm run typecheck  # tipos
npm test           # pruebas (geometría de la hoja, del texto y de las marcas)
npm run build      # compila en dist/
```

Cada push a `main` (o a una rama `claude/…`) pasa por GitHub Actions (`.github/workflows/publicar.yml`):
revisa tipos, corre las pruebas, compila y publica en la rama `gh-pages`.

El libro de muestra se genera con `node scripts/generar-muestra.cjs` (usa Playwright).

## Propuesta visual

![Celular: estante, pasar la hoja y menú de la esquina](diseno/propuesta-1-celular.jpg)
![Celular: papel y sonido, Mis frases y materiales](diseno/propuesta-2-celular.jpg)
![Computadora: libro abierto a doble página](diseno/propuesta-3-computadora.jpg)

La maqueta es `diseno/propuesta-visual.html` (ábrela en el navegador). Para volver a generar las imágenes:
`node diseno/render.cjs` (necesita el paquete `playwright`).

## Licencias de terceros

- Fuentes EB Garamond, Fraunces, DM Sans y Caveat (`diseno/fuentes/`): SIL Open Font License 1.1, vía Fontsource.
- Íconos de [Lucide](https://lucide.dev) (`diseno/iconos.js`, `src/ui/Icono.tsx`): licencia ISC. El ícono «encerrar» es propio.
- Texto de muestra: *Don Quijote de la Mancha*, Miguel de Cervantes (1605), dominio público.
- [PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`): Apache-2.0. Sus recursos (mapas de caracteres,
  fuentes estándar, módulos wasm) se publican en `pdfjs/` con sus licencias.
- React, Zustand e idb: licencia MIT.
- Sonidos (`public/sonidos/`): generados con ElevenLabs para este proyecto; ver `public/sonidos/LICENCIA.md`.
- Libro de muestra (`public/muestra/`): texto de Cervantes (dominio público) compuesto con EB Garamond (OFL 1.1).
- Íconos de la app (`public/icono.svg`, `public/iconos/`): propios.
- Portadas de internet: se muestran desde [Open Library](https://openlibrary.org/dev/docs/api/covers) y
  [Google Books](https://developers.google.com/books) para uso personal; no se incluyen en el proyecto.
- Portadas «de tela»: las dibuja la app (propias).
