// Service worker de Entre Hojas: guarda la app en el dispositivo para que se abra y funcione sin
// internet. Lo arma scripts/pwa.mjs al compilar: pone la versión y la lista de archivos de la app.
/* eslint-disable */

const VERSION = '__VERSION__';
const ARCHIVOS = __ARCHIVOS__;
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
