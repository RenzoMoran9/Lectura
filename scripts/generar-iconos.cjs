// Genera los íconos de la app instalable (PNG) a partir de public/icono.svg, que es propio.
// Uso: node scripts/generar-iconos.cjs   (necesita el paquete «playwright»)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const svg = fs.readFileSync(path.join(__dirname, '../public/icono.svg'), 'utf8');
const dibujo = svg.replace(/<rect[^>]*\/>/, ''); // el libro sin el fondo redondeado
const salida = path.join(__dirname, '../public/iconos');

// [archivo, tamaño, fondo cuadrado a sangre, escala del libro]
const iconos = [
  ['icono-192.png', 192, false, 1],
  ['icono-512.png', 512, false, 1],
  ['icono-maskable-512.png', 512, true, 0.66], // Android recorta hasta un círculo del 80 %
  ['apple-touch-icon.png', 180, true, 0.86], // el iPhone redondea las esquinas solo
];

(async () => {
  fs.mkdirSync(salida, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [archivo, tam, sangre, escala] of iconos) {
    const contenido = sangre
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${tam}" height="${tam}"><rect width="64" height="64" fill="#F4EEE2"/><g transform="translate(32 33) scale(${escala}) translate(-32 -33)">${dibujo.replace(/<\/?svg[^>]*>/g, '')}</g></svg>`
      : svg.replace('<svg ', `<svg width="${tam}" height="${tam}" `);
    await page.setViewportSize({ width: tam, height: tam });
    await page.setContent(`<html><body style="margin:0;background:transparent">${contenido}</body></html>`);
    await page.screenshot({ path: path.join(salida, archivo), omitBackground: !sangre, clip: { x: 0, y: 0, width: tam, height: tam } });
    console.log('✓', archivo);
  }
  await browser.close();
})();
