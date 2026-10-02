// Service worker de Entre Hojas: guarda la app en el dispositivo para que se abra y funcione sin
// internet. Lo arma scripts/pwa.mjs al compilar: pone la versión y la lista de archivos de la app.
/* eslint-disable */

const VERSION = '19316620daa9';
const ARCHIVOS = [
 "assets/index-BMkbQRQU.js",
 "assets/index-CZsOzwF-.css",
 "assets/ort-wasm-simd-threaded-DcHrbrbl.wasm",
 "assets/pdf.worker.min-BmVo14Nb.mjs",
 "assets/voces.worker-QJ8V8spS.js",
 "fuentes/caveat-latin-700-normal.woff2",
 "fuentes/dm-sans-latin-400-normal.woff2",
 "fuentes/dm-sans-latin-500-normal.woff2",
 "fuentes/dm-sans-latin-600-normal.woff2",
 "fuentes/eb-garamond-latin-400-italic.woff2",
 "fuentes/eb-garamond-latin-400-normal.woff2",
 "fuentes/fraunces-latin-400-italic.woff2",
 "fuentes/fraunces-latin-400-normal.woff2",
 "fuentes/fraunces-latin-600-normal.woff2",
 "icono.svg",
 "iconos/apple-touch-icon.png",
 "iconos/icono-192.png",
 "iconos/icono-512.png",
 "iconos/icono-maskable-512.png",
 "index.html",
 "manifest.webmanifest",
 "pdfjs/cmaps/78-EUC-H.bcmap",
 "pdfjs/cmaps/78-EUC-V.bcmap",
 "pdfjs/cmaps/78-H.bcmap",
 "pdfjs/cmaps/78-RKSJ-H.bcmap",
 "pdfjs/cmaps/78-RKSJ-V.bcmap",
 "pdfjs/cmaps/78-V.bcmap",
 "pdfjs/cmaps/78ms-RKSJ-H.bcmap",
 "pdfjs/cmaps/78ms-RKSJ-V.bcmap",
 "pdfjs/cmaps/83pv-RKSJ-H.bcmap",
 "pdfjs/cmaps/90ms-RKSJ-H.bcmap",
 "pdfjs/cmaps/90ms-RKSJ-V.bcmap",
 "pdfjs/cmaps/90msp-RKSJ-H.bcmap",
 "pdfjs/cmaps/90msp-RKSJ-V.bcmap",
 "pdfjs/cmaps/90pv-RKSJ-H.bcmap",
 "pdfjs/cmaps/90pv-RKSJ-V.bcmap",
 "pdfjs/cmaps/Add-H.bcmap",
 "pdfjs/cmaps/Add-RKSJ-H.bcmap",
 "pdfjs/cmaps/Add-RKSJ-V.bcmap",
 "pdfjs/cmaps/Add-V.bcmap",
 "pdfjs/cmaps/Adobe-CNS1-0.bcmap",
 "pdfjs/cmaps/Adobe-CNS1-1.bcmap",
 "pdfjs/cmaps/Adobe-CNS1-2.bcmap",
 "pdfjs/cmaps/Adobe-CNS1-3.bcmap",
 "pdfjs/cmaps/Adobe-CNS1-4.bcmap",
 "pdfjs/cmaps/Adobe-CNS1-5.bcmap",
 "pdfjs/cmaps/Adobe-CNS1-6.bcmap",
 "pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap",
 "pdfjs/cmaps/Adobe-GB1-0.bcmap",
 "pdfjs/cmaps/Adobe-GB1-1.bcmap",
 "pdfjs/cmaps/Adobe-GB1-2.bcmap",
 "pdfjs/cmaps/Adobe-GB1-3.bcmap",
 "pdfjs/cmaps/Adobe-GB1-4.bcmap",
 "pdfjs/cmaps/Adobe-GB1-5.bcmap",
 "pdfjs/cmaps/Adobe-GB1-UCS2.bcmap",
 "pdfjs/cmaps/Adobe-Japan1-0.bcmap",
 "pdfjs/cmaps/Adobe-Japan1-1.bcmap",
 "pdfjs/cmaps/Adobe-Japan1-2.bcmap",
 "pdfjs/cmaps/Adobe-Japan1-3.bcmap",
 "pdfjs/cmaps/Adobe-Japan1-4.bcmap",
 "pdfjs/cmaps/Adobe-Japan1-5.bcmap",
 "pdfjs/cmaps/Adobe-Japan1-6.bcmap",
 "pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap",
 "pdfjs/cmaps/Adobe-Korea1-0.bcmap",
 "pdfjs/cmaps/Adobe-Korea1-1.bcmap",
 "pdfjs/cmaps/Adobe-Korea1-2.bcmap",
 "pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap",
 "pdfjs/cmaps/B5-H.bcmap",
 "pdfjs/cmaps/B5-V.bcmap",
 "pdfjs/cmaps/B5pc-H.bcmap",
 "pdfjs/cmaps/B5pc-V.bcmap",
 "pdfjs/cmaps/CNS-EUC-H.bcmap",
 "pdfjs/cmaps/CNS-EUC-V.bcmap",
 "pdfjs/cmaps/CNS1-H.bcmap",
 "pdfjs/cmaps/CNS1-V.bcmap",
 "pdfjs/cmaps/CNS2-H.bcmap",
 "pdfjs/cmaps/CNS2-V.bcmap",
 "pdfjs/cmaps/ETHK-B5-H.bcmap",
 "pdfjs/cmaps/ETHK-B5-V.bcmap",
 "pdfjs/cmaps/ETen-B5-H.bcmap",
 "pdfjs/cmaps/ETen-B5-V.bcmap",
 "pdfjs/cmaps/ETenms-B5-H.bcmap",
 "pdfjs/cmaps/ETenms-B5-V.bcmap",
 "pdfjs/cmaps/EUC-H.bcmap",
 "pdfjs/cmaps/EUC-V.bcmap",
 "pdfjs/cmaps/Ext-H.bcmap",
 "pdfjs/cmaps/Ext-RKSJ-H.bcmap",
 "pdfjs/cmaps/Ext-RKSJ-V.bcmap",
 "pdfjs/cmaps/Ext-V.bcmap",
 "pdfjs/cmaps/GB-EUC-H.bcmap",
 "pdfjs/cmaps/GB-EUC-V.bcmap",
 "pdfjs/cmaps/GB-H.bcmap",
 "pdfjs/cmaps/GB-V.bcmap",
 "pdfjs/cmaps/GBK-EUC-H.bcmap",
 "pdfjs/cmaps/GBK-EUC-V.bcmap",
 "pdfjs/cmaps/GBK2K-H.bcmap",
 "pdfjs/cmaps/GBK2K-V.bcmap",
 "pdfjs/cmaps/GBKp-EUC-H.bcmap",
 "pdfjs/cmaps/GBKp-EUC-V.bcmap",
 "pdfjs/cmaps/GBT-EUC-H.bcmap",
 "pdfjs/cmaps/GBT-EUC-V.bcmap",
 "pdfjs/cmaps/GBT-H.bcmap",
 "pdfjs/cmaps/GBT-V.bcmap",
 "pdfjs/cmaps/GBTpc-EUC-H.bcmap",
 "pdfjs/cmaps/GBTpc-EUC-V.bcmap",
 "pdfjs/cmaps/GBpc-EUC-H.bcmap",
 "pdfjs/cmaps/GBpc-EUC-V.bcmap",
 "pdfjs/cmaps/H.bcmap",
 "pdfjs/cmaps/HKdla-B5-H.bcmap",
 "pdfjs/cmaps/HKdla-B5-V.bcmap",
 "pdfjs/cmaps/HKdlb-B5-H.bcmap",
 "pdfjs/cmaps/HKdlb-B5-V.bcmap",
 "pdfjs/cmaps/HKgccs-B5-H.bcmap",
 "pdfjs/cmaps/HKgccs-B5-V.bcmap",
 "pdfjs/cmaps/HKm314-B5-H.bcmap",
 "pdfjs/cmaps/HKm314-B5-V.bcmap",
 "pdfjs/cmaps/HKm471-B5-H.bcmap",
 "pdfjs/cmaps/HKm471-B5-V.bcmap",
 "pdfjs/cmaps/HKscs-B5-H.bcmap",
 "pdfjs/cmaps/HKscs-B5-V.bcmap",
 "pdfjs/cmaps/Hankaku.bcmap",
 "pdfjs/cmaps/Hiragana.bcmap",
 "pdfjs/cmaps/KSC-EUC-H.bcmap",
 "pdfjs/cmaps/KSC-EUC-V.bcmap",
 "pdfjs/cmaps/KSC-H.bcmap",
 "pdfjs/cmaps/KSC-Johab-H.bcmap",
 "pdfjs/cmaps/KSC-Johab-V.bcmap",
 "pdfjs/cmaps/KSC-V.bcmap",
 "pdfjs/cmaps/KSCms-UHC-H.bcmap",
 "pdfjs/cmaps/KSCms-UHC-HW-H.bcmap",
 "pdfjs/cmaps/KSCms-UHC-HW-V.bcmap",
 "pdfjs/cmaps/KSCms-UHC-V.bcmap",
 "pdfjs/cmaps/KSCpc-EUC-H.bcmap",
 "pdfjs/cmaps/KSCpc-EUC-V.bcmap",
 "pdfjs/cmaps/Katakana.bcmap",
 "pdfjs/cmaps/NWP-H.bcmap",
 "pdfjs/cmaps/NWP-V.bcmap",
 "pdfjs/cmaps/RKSJ-H.bcmap",
 "pdfjs/cmaps/RKSJ-V.bcmap",
 "pdfjs/cmaps/Roman.bcmap",
 "pdfjs/cmaps/UniCNS-UCS2-H.bcmap",
 "pdfjs/cmaps/UniCNS-UCS2-V.bcmap",
 "pdfjs/cmaps/UniCNS-UTF16-H.bcmap",
 "pdfjs/cmaps/UniCNS-UTF16-V.bcmap",
 "pdfjs/cmaps/UniCNS-UTF32-H.bcmap",
 "pdfjs/cmaps/UniCNS-UTF32-V.bcmap",
 "pdfjs/cmaps/UniCNS-UTF8-H.bcmap",
 "pdfjs/cmaps/UniCNS-UTF8-V.bcmap",
 "pdfjs/cmaps/UniGB-UCS2-H.bcmap",
 "pdfjs/cmaps/UniGB-UCS2-V.bcmap",
 "pdfjs/cmaps/UniGB-UTF16-H.bcmap",
 "pdfjs/cmaps/UniGB-UTF16-V.bcmap",
 "pdfjs/cmaps/UniGB-UTF32-H.bcmap",
 "pdfjs/cmaps/UniGB-UTF32-V.bcmap",
 "pdfjs/cmaps/UniGB-UTF8-H.bcmap",
 "pdfjs/cmaps/UniGB-UTF8-V.bcmap",
 "pdfjs/cmaps/UniJIS-UCS2-H.bcmap",
 "pdfjs/cmaps/UniJIS-UCS2-HW-H.bcmap",
 "pdfjs/cmaps/UniJIS-UCS2-HW-V.bcmap",
 "pdfjs/cmaps/UniJIS-UCS2-V.bcmap",
 "pdfjs/cmaps/UniJIS-UTF16-H.bcmap",
 "pdfjs/cmaps/UniJIS-UTF16-V.bcmap",
 "pdfjs/cmaps/UniJIS-UTF32-H.bcmap",
 "pdfjs/cmaps/UniJIS-UTF32-V.bcmap",
 "pdfjs/cmaps/UniJIS-UTF8-H.bcmap",
 "pdfjs/cmaps/UniJIS-UTF8-V.bcmap",
 "pdfjs/cmaps/UniJIS2004-UTF16-H.bcmap",
 "pdfjs/cmaps/UniJIS2004-UTF16-V.bcmap",
 "pdfjs/cmaps/UniJIS2004-UTF32-H.bcmap",
 "pdfjs/cmaps/UniJIS2004-UTF32-V.bcmap",
 "pdfjs/cmaps/UniJIS2004-UTF8-H.bcmap",
 "pdfjs/cmaps/UniJIS2004-UTF8-V.bcmap",
 "pdfjs/cmaps/UniJISPro-UCS2-HW-V.bcmap",
 "pdfjs/cmaps/UniJISPro-UCS2-V.bcmap",
 "pdfjs/cmaps/UniJISPro-UTF8-V.bcmap",
 "pdfjs/cmaps/UniJISX0213-UTF32-H.bcmap",
 "pdfjs/cmaps/UniJISX0213-UTF32-V.bcmap",
 "pdfjs/cmaps/UniJISX02132004-UTF32-H.bcmap",
 "pdfjs/cmaps/UniJISX02132004-UTF32-V.bcmap",
 "pdfjs/cmaps/UniKS-UCS2-H.bcmap",
 "pdfjs/cmaps/UniKS-UCS2-V.bcmap",
 "pdfjs/cmaps/UniKS-UTF16-H.bcmap",
 "pdfjs/cmaps/UniKS-UTF16-V.bcmap",
 "pdfjs/cmaps/UniKS-UTF32-H.bcmap",
 "pdfjs/cmaps/UniKS-UTF32-V.bcmap",
 "pdfjs/cmaps/UniKS-UTF8-H.bcmap",
 "pdfjs/cmaps/UniKS-UTF8-V.bcmap",
 "pdfjs/cmaps/V.bcmap",
 "pdfjs/cmaps/WP-Symbol.bcmap",
 "pdfjs/iccs/CGATS001Compat-v2-micro.icc",
 "pdfjs/standard_fonts/FoxitDingbats.pfb",
 "pdfjs/standard_fonts/FoxitFixed.pfb",
 "pdfjs/standard_fonts/FoxitFixedBold.pfb",
 "pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb",
 "pdfjs/standard_fonts/FoxitFixedItalic.pfb",
 "pdfjs/standard_fonts/FoxitSerif.pfb",
 "pdfjs/standard_fonts/FoxitSerifBold.pfb",
 "pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb",
 "pdfjs/standard_fonts/FoxitSerifItalic.pfb",
 "pdfjs/standard_fonts/FoxitSymbol.pfb",
 "pdfjs/standard_fonts/LICENSE_FOXIT",
 "pdfjs/standard_fonts/LICENSE_LIBERATION",
 "pdfjs/standard_fonts/LiberationSans-Bold.ttf",
 "pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf",
 "pdfjs/standard_fonts/LiberationSans-Italic.ttf",
 "pdfjs/standard_fonts/LiberationSans-Regular.ttf",
 "pdfjs/wasm/LICENSE_JBIG2",
 "pdfjs/wasm/LICENSE_OPENJPEG",
 "pdfjs/wasm/LICENSE_PDFJS_JBIG2",
 "pdfjs/wasm/LICENSE_PDFJS_OPENJPEG",
 "pdfjs/wasm/LICENSE_PDFJS_QCMS",
 "pdfjs/wasm/LICENSE_QCMS",
 "pdfjs/wasm/jbig2.wasm",
 "pdfjs/wasm/jbig2_nowasm_fallback.js",
 "pdfjs/wasm/openjpeg.wasm",
 "pdfjs/wasm/openjpeg_nowasm_fallback.js",
 "pdfjs/wasm/qcms_bg.wasm",
 "pdfjs/wasm/quickjs-eval.js",
 "pdfjs/wasm/quickjs-eval.wasm",
 "sonidos/borrador-1.mp3",
 "sonidos/hoja.json",
 "sonidos/hoja.wav",
 "sonidos/lapiz-1.mp3",
 "sonidos/lapiz-2.mp3",
 "sonidos/resaltador-1.mp3"
];
const CACHE_APP = `entre-hojas-app-${VERSION}`;
const CACHE_VARIOS = 'entre-hojas-varios';
const CACHE_PORTADAS = 'entre-hojas-portadas';
const BASE = new URL('./', self.location.href).href;
const PORTADAS = /(^|\.)(openlibrary\.org|archive\.org|books\.google\.com|googleusercontent\.com)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(ARCHIVOS.map((f) => new Request(BASE + f, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const viejas = (await caches.keys()).filter((k) => k.startsWith('entre-hojas-app-') && k !== CACHE_APP);
      await Promise.all(viejas.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// La app avisa «Nueva versión · Actualizar»; al tocarlo, la nueva toma el control.
self.addEventListener('message', (e) => {
  if (e.data === 'actualizar') self.skipWaiting();
});

// Origen aislado: así las voces propias pueden usar varios núcleos del procesador (GitHub Pages no
// deja poner estas cabeceras; las pone el service worker al abrir la app). «credentialless» deja
// mostrar las portadas de internet como siempre.
function aislada(r) {
  const h = new Headers(r.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET' || pedido.headers.has('range')) return;
  const url = new URL(pedido.url);

  // Abrir la app: siempre la página guardada (la versión nueva llega con el aviso de actualizar).
  if (pedido.mode === 'navigate' && url.href.startsWith(BASE)) {
    e.respondWith(
      caches
        .match(BASE + 'index.html', { cacheName: CACHE_APP })
        .then((r) => r || fetch(pedido))
        .then(aislada),
    );
    return;
  }

  // Las voces propias: las guarda su Worker en su propia caché (aquí no se duplican).
  if (url.href.startsWith(BASE + 'voces/')) return;

  // Archivos de la app: primero lo guardado; lo que no estaba (el libro de muestra) se guarda al usarlo.
  // Llevan las mismas cabeceras que la página: los workers (PDF.js, las voces) se bloquean sin ellas.
  if (url.href.startsWith(BASE)) {
    e.respondWith(
      (async () => {
        const guardado = await caches.match(pedido);
        if (guardado) return aislada(guardado);
        const r = await fetch(pedido);
        if (r.ok && r.status === 200 && r.type === 'basic') {
          const copia = r.clone();
          e.waitUntil(caches.open(CACHE_VARIOS).then((c) => c.put(pedido, copia)));
        }
        return r.type === 'basic' ? aislada(r) : r;
      })(),
    );
    return;
  }

  // Portadas de internet que la app guardó en la caché (las que no se pudieron guardar como imagen).
  if (pedido.destination === 'image' && PORTADAS.test(url.hostname)) {
    e.respondWith(
      caches.match(pedido.url, { cacheName: CACHE_PORTADAS, ignoreVary: true }).then((r) => r || fetch(pedido)),
    );
  }
});
