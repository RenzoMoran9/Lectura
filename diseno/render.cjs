// Convierte la maqueta en imágenes JPG.
// Uso (desde la raíz del repo del lector): node diseno/render.cjs   (necesita el paquete «playwright»)
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const dir = __dirname;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1480, height: 1200 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('Error en la página:', e.message));
  await page.goto('file://' + path.join(dir, 'propuesta-visual.html'));
  await page.waitForFunction(() => window.__listo === true, null, { timeout: 20000 });
  await page.waitForTimeout(300);

  const hojas = [
    ['#hoja1', 'propuesta-1-celular.jpg'],
    ['#hoja2', 'propuesta-2-celular.jpg'],
    ['#hoja3', 'propuesta-3-computadora.jpg'],
  ];
  for (const [sel, archivo] of hojas) {
    await (await page.$(sel)).screenshot({ path: path.join(dir, archivo), type: 'jpeg', quality: 88 });
    console.log('✓', archivo);
  }
  await browser.close();
})();
