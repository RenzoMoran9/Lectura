# Entre Hojas — lector de libros en PDF

> El nombre de la app es «Entre Hojas»: como lo que uno guarda entre las páginas de un libro (una flor seca, un papelito); aquí, mis frases.

## Qué quiero
Quiero volver a leer mis libros como si fueran de papel, pero desde PDFs. Es una app donde subo un libro en PDF, del peso que sea, y lo leo pasando las hojas con el dedo, con la sensación y el sonido de un libro de verdad.

La uso sobre todo desde el celular, y también desde la computadora.

## Funciones imprescindibles
1. **Subir un PDF de cualquier tamaño.** No se convierte ni se transforma: se guarda tal cual y se ve en el orden en que viene.
2. **Pasar la hoja con el dedo, como en la vida real.**
   - La hoja se curva y sigue el dedo durante todo el recorrido. No pasa sola con un toque ni con un deslizamiento corto: tengo que arrastrarla yo.
   - Si suelto antes de la mitad, la hoja regresa a su sitio. Pasada la mitad, termina de caer del otro lado.
   - Tiene sombra y se ve el reverso del papel.
3. **Sonido de hoja real** al pasarla:
   - un roce mientras arrastro (más rápido, más fuerte);
   - un golpecito suave cuando la hoja se asienta.

   El sonido se puede regular o apagar.
4. **Aspecto de papel**, con textura y color. Se elige entre cuatro tipos:
   - blanco;
   - crema;
   - antiguo (amarillento, con bordes tostados, como un libro viejo);
   - noche.
5. **Menú discreto en círculo.** Es un botón chico y semitransparente en una esquina, que puedo mover. No tapa la lectura. Al tocarlo se abre en abanico con:
   - resaltador (5 colores);
   - lápiz para encerrar frases (yo normalmente encierro las frases);
   - borrador;
   - papel;
   - Mis frases.
6. **Mis frases.** Todo lo que resalto o encierro se guarda solo, con el texto, el libro, la página, la fecha y el color, en un espacio aparte para revisarlo y hacer memoria.
   - Al tocar una frase, me lleva a su página.
   - «Repasar» me muestra frases al azar.
7. **Recordar dónde me quedé** en cada libro y abrirlo ahí.

## Lo que NO va (por ahora)
Tienda de libros, botones de compartir, notas largas, conversión a EPUB y reacomodar el texto del PDF.

## Diseño: propuesta visual v1
La referencia está en `diseno/`:
- `propuesta-visual.html`: maqueta estática, no es la app;
- `propuesta-1-celular.jpg`, `propuesta-2-celular.jpg` y `propuesta-3-computadora.jpg`: la maqueta hecha imagen.

Para volver a generar las imágenes: `node diseno/render.cjs` (usa Playwright).

Pantallas:
1. **Estante.**
   - Portadas y avance de cada libro.
   - Tarjeta «Seguir leyendo» con el botón «Continuar».
   - Tarjeta «Para recordar hoy», con una frase guardada.
   - Botón «Subir PDF».
   - Pestañas «Estante» y «Mis frases».
2. **Pasar la hoja.** La hoja curvada va pegada al dedo, que la toma desde la esquina de abajo. Se ve el reverso con el texto al revés, apenas visible, y la página siguiente debajo con sombra. El número de página y el título del libro aparecen tenues.
3. **Menú de la esquina abierto.**
   - Abanico de 5 botones y una paleta de colores del resaltador.
   - Aviso arriba: «Resaltando · la hoja no se pasa · Listo».
   - Frase encerrada a lápiz, con el aviso «Guardada en Mis frases».
4. **Papel y sonido.** Hoja inferior con las 4 muestras de papel, el interruptor del sonido, el volumen y «Libro nuevo / Libro antiguo» (tipo de sonido).
5. **Mis frases.** Buscador, filtros por libro y por color, tarjetas agrupadas por libro con «Ir a la página», y el botón «Repasar».
6. **Materiales.** Papeles, resaltadores, lápices, el tacto de la hoja (regresa o pasa según la mitad) y los dos sonidos.
7. **Computadora.**
   - Libro abierto a doble página sobre una mesa en penumbra.
   - La esquina de la hoja se levanta con el mouse.
   - Panel lateral con Mis frases.
   - Barra inferior para saltar de página.

### Estilo
- **Tinta:** `#2A2520`; tinta suave `#6A6056`; tinta tenue `#9A8F82`.
- **Acento («cinta marcapáginas»):** `#8E2F2A`.
- **Fondo de la interfaz:** `#F4EEE2`; tarjetas `#FBF7EF`.
- **Papeles:**

  | Papel | Color | Detalles |
  | --- | --- | --- |
  | blanco | `#FBFAF6` | |
  | crema | `#F5EDDB` | |
  | antiguo | `#E7D3AA` | viñeta tostada en los bordes y algunas manchitas |
  | noche | `#23201C` | texto `#D6CCBA` |

  La textura del papel se genera con ruido (`feTurbulence`), sin imágenes externas.
- **Resaltadores (RGB):** amarillo `255,212,38`, verde `138,212,92`, rosa `255,136,176`, celeste `100,188,240` y naranja `255,158,68`. Se pintan con `multiply` y bordes irregulares de marcador.
- **Lápices para encerrar:** grafito `#4D453D` y rojo `#B3362B`. El trazo es a mano, con temblor, se pasa un poco al cerrar y sigue la forma de la frase aunque ocupe varios renglones.
- **Letras de la app:** Fraunces para los títulos y DM Sans para los botones y menús. El texto del libro es el del PDF, tal cual.
- **Íconos:** de Lucide (licencia ISC) o propios.
- **Portadas:** la original, buscada en internet (Open Library y Google Books) por título y autor; si no aparece, la primera página del PDF. Desde el «⋯» de cada libro se elige otra: la del PDF, otra de internet o una «de tela» hecha por la app.
- **Recursos:** todo propio o de licencia libre; nada copiado.

## Decisiones técnicas
- **Web app instalable (PWA).**
  - Se abre con un enlace en el celular y en la PC.
  - En el celular se agrega a la pantalla de inicio: queda con ícono, a pantalla completa y funciona sin internet.
  - No pasa por tiendas de apps.
- **Stack:** Vite + React + TypeScript (el mismo que mi proyecto de posits) y Zustand para el estado.
- **Lectura del PDF:** con PDF.js (`pdfjs-dist`, licencia Apache-2.0).
  - Solo se dibujan la página visible y las vecinas (±1–2).
  - El archivo se lee por partes (rangos), así que su tamaño no importa.
  - La capa de texto de PDF.js se usa para resaltar y encerrar.
- **Guardado local:**
  - El PDF se guarda tal cual en OPFS o IndexedDB.
  - Se pide `navigator.storage.persist()` para que el navegador no lo borre.
  - El avance y las frases van en IndexedDB.
- **Hoja que se curva:** implementación propia en WebGL (por ejemplo con three.js). Es una malla que se dobla alrededor de un cilindro, con luz y sombra.
  - No se usa una librería de «page flip», para tener control total del gesto.
  - La hoja sigue al dedo 1:1. Al soltar, la posición decide: antes de la mitad regresa; después, cae.
  - Debe ir a 60 fps en un celular de gama media.
- **Papel:** es una capa encima de la página dibujada, con `mix-blend-mode: multiply`. El blanco del PDF toma el color del papel y la tinta queda oscura.
  - Noche: invertir colores y dar un tono cálido.
  - El PDF nunca se modifica.
- **Sonido:** con Web Audio API.
  - Un roce en bucle cuyo volumen sigue la velocidad del dedo, más un golpe al asentarse la hoja.
  - Varias variantes elegidas al azar, para que no suene repetido.
  - Grabaciones reales de licencia libre (CC0, por ejemplo de Freesound). Alternativa: generarlas con ElevenLabs.
  - Dos juegos de sonido: «libro nuevo» y «libro antiguo».
  - Sonido de fondo opcional mientras se lee, elegido para cada libro: para relajarse (playa, bosque y fogata, lluvia) o según el género (terror, suspenso, drama, acción), con su propio volumen.
- **Gestos:**
  - En modo lectura, el dedo pasa las hojas.
  - En modo resaltar o encerrar, el dedo marca y la hoja no se pasa (aviso arriba con «Listo» para salir).
  - Se pellizca para acercar. Con zoom, arriba y abajo mueve la página y a los lados la pasa (cuando ya se ve el borde del texto); el zoom se mantiene en la página siguiente.
  - Doble toque: el texto a todo el ancho de la pantalla (se recortan los márgenes blancos, sin cortar el texto) o vuelve a la página entera.
  - Celular de lado: la página va a todo el ancho y se lee deslizando hacia abajo.
- **PDFs escaneados (sin texto):** se leen igual. Lo que se resalte o encierre se guarda como recorte de imagen. El reconocimiento de texto (OCR) queda para más adelante.
- **Celular:** una página a la vez.
- **PC o tablet en horizontal:** doble página, las flechas ← → pasan la hoja con el mismo sonido y Mis frases va en un panel lateral.
- **Publicación:** GitHub Pages con GitHub Actions. Antes de publicar se revisan los tipos, se corren las pruebas y se compila.
- **Nube (etapa 4):** Supabase, que ya he usado.
  - Inicio de sesión.
  - Sincronización del avance y las frases, que pesan poco.
  - Cada dispositivo reconoce el libro por su huella (el fingerprint de PDF.js).
  - Subir los PDFs completos a la nube queda para después, porque el plan gratis de Supabase limita el tamaño por archivo.

## Etapas
0. **Propuesta visual.** Hecha (v1, en `diseno/`).
1. **Lo principal.**
   - Subir un PDF de cualquier tamaño.
   - Pasar la hoja con el dedo: curva realista, regresa si suelto antes de la mitad.
   - Sonido de papel.
   - Los 4 papeles.
   - Recordar la página.
2. **Menú de la esquina.** Resaltador (5 colores), lápiz para encerrar, borrador, Mis frases con «Ir a la página» y «Repasar».
3. **Estante.**
   - Varios libros con portada y avance.
   - Doble página en la PC.
   - Instalar en el celular.
   - Funcionar sin internet.
4. **Nube.** Inicio de sesión y sincronización del avance y las frases entre el celular y la PC (Supabase).

## Cómo quiero que trabajes
- Textos de la interfaz en español.
- Prioridad al celular: tocar, arrastrar y pasar hojas tiene que sentirse bien en una pantalla pequeña.
- Construye por etapas y muéstrame cada una funcionando. Al terminar cada etapa, dime cómo probarla en el celular y qué sigue.
- Si vas a cambiar algo del diseño, muéstrame antes una imagen.
- Recursos gráficos y sonidos: propios o de licencia libre, con su licencia anotada.

## Extras (solo si sobra tiempo)
- Repaso diario de frases, tipo tarjetas.
- Notas en una frase.
- Exportar mis frases.
- OCR para PDFs escaneados.
- Índice y marcadores del PDF.
- Brillo y tibieza del papel.
