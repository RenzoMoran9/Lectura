// Genera el libro de muestra (public/muestra/don-quijote-capitulo-1.pdf) a partir del texto de la
// propuesta visual: el comienzo del capítulo primero de Don Quijote (Cervantes, 1605, dominio público),
// compuesto con EB Garamond (SIL OFL 1.1).
// Uso: node scripts/generar-muestra.cjs   (necesita el paquete «playwright»)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const maqueta = fs.readFileSync(path.join(raiz, 'diseno/propuesta-visual.html'), 'utf8');
const parrafos = [];
for (const id of ['p12', 'p13', 'p15']) {
  const t = maqueta.match(new RegExp(`<template id="${id}">([\\s\\S]*?)</template>`))[1].replace(/<svg[\s\S]*?<\/svg>/g, '');
  for (const [, p] of t.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) parrafos.push(p.replace(/<[^>]+>/g, '').trim());
}
// Los fragmentos de la maqueta cortan un párrafo entre páginas; aquí se vuelven a unir.
const texto = [];
for (const p of parrafos) {
  if (/^[a-záéíóú]/.test(p) && texto.length) texto[texto.length - 1] += ' ' + p;
  else texto.push(p);
}
const fuente = (f) => `url(file://${path.join(raiz, 'diseno/fuentes', f)})`;
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Don Quijote de la Mancha</title><style>
@font-face{font-family:G;src:${fuente('eb-garamond-latin-400-normal.woff2')};font-weight:400}
@font-face{font-family:G;src:${fuente('eb-garamond-latin-400-italic.woff2')};font-weight:400;font-style:italic}
@font-face{font-family:G;src:${fuente('eb-garamond-latin-500-normal.woff2')};font-weight:500}
@font-face{font-family:G;src:${fuente('eb-garamond-latin-600-normal.woff2')};font-weight:600}
@page{size:118mm 182mm;margin:17mm 14mm 19mm 15mm}
body{margin:0;font:400 11.6pt/1.42 G;color:#1c1916;hyphens:auto;-webkit-hyphens:auto;text-align:justify;font-variant-numeric:oldstyle-nums}
.port{height:146mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;break-after:page}
.port h1{font:500 25pt/1.08 G;letter-spacing:.05em;text-transform:uppercase;margin:0}
.port .de{font:italic 400 14pt G;margin:8pt 0 26pt}
.port .aut{font:500 9.5pt G;letter-spacing:.3em;text-transform:uppercase}
.port .nota{font:italic 400 9.5pt G;margin-top:34mm;color:#6a6056}
.cap{text-align:center;margin:10mm 0 9mm}
.cap .n{font:500 8.8pt G;letter-spacing:.28em;text-transform:uppercase}
.cap .t{font:italic 400 12.4pt/1.28 G;margin-top:5pt}
.cap .or{margin-top:8pt;font-size:9pt;letter-spacing:.5em}
p{margin:0;text-indent:1.3em;orphans:2;widows:2}
p.primero{text-indent:0}
.capital{float:left;font:500 36pt/30pt G;margin:3pt 4pt 0 0;color:#8E2F2A}
.fin{text-align:center;margin-top:12mm;font:italic 400 10.5pt G;color:#6a6056}
</style></head><body>
<section class="port"><h1>Don Quijote<br>de la Mancha</h1><div class="de">El ingenioso hidalgo</div><div class="aut">Miguel de Cervantes</div><div class="nota">Libro de muestra · capítulo primero (fragmento)</div></section>
<div class="cap"><div class="n">Capítulo primero</div><div class="t">Que trata de la condición y ejercicio del famoso<br>hidalgo don Quijote de la Mancha</div><div class="or">— ◆ —</div></div>
${texto.map((p, i) => (i === 0 ? `<p class="primero"><span class="capital">${p[0]}</span>${p.slice(1)}</p>` : `<p>${p}</p>`)).join('\n')}
<p class="fin">Fin de la muestra. Sube tus propios libros en PDF desde el estante.</p>
</body></html>`;

(async () => {
  const salida = path.join(raiz, 'public/muestra/don-quijote-capitulo-1.pdf');
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const tmp = path.join(raiz, 'scripts', '.muestra.html');
  fs.writeFileSync(tmp, html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  // Sin números de página: Entre Hojas pone el suyo, tenue, al pie de la hoja.
  await page.pdf({ path: salida, preferCSSPageSize: true });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log('✓', path.relative(raiz, salida), fs.statSync(salida).size, 'bytes');
})();
