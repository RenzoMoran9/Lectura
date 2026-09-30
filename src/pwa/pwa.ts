// App instalable: el botón «Instalar» (Android y PC), el aviso para el iPhone y el de «Nueva versión».

import { create } from 'zustand';

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface EstadoPwa {
  /** El navegador ofrece instalarla (Chrome en Android y en la PC). */
  evento: EventoInstalar | null;
  instalada: boolean;
  /** En el iPhone y el iPad no hay botón: se instala desde «Compartir». */
  ios: boolean;
  /** Hay una versión nueva lista, esperando a que se toque «Actualizar». */
  nueva: ServiceWorker | null;
  instalar: () => Promise<void>;
  actualizar: () => void;
}

const enPantallaDeInicio = () =>
  typeof window !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as { standalone?: boolean }).standalone === true);

const esIos = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

let pidioActualizar = false;

export const usePwa = create<EstadoPwa>()((set, get) => ({
  evento: null,
  instalada: enPantallaDeInicio(),
  ios: esIos() && !enPantallaDeInicio(),
  nueva: null,
  instalar: async () => {
    const e = get().evento;
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    set({ evento: null, instalada: outcome === 'accepted' });
  },
  actualizar: () => {
    const nueva = get().nueva;
    if (!nueva) return;
    pidioActualizar = true;
    nueva.postMessage('actualizar');
  },
}));

export function iniciarPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwa.setState({ evento: e as EventoInstalar });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ evento: null, instalada: true }));

  // En desarrollo no hay service worker: siempre se ve lo último.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (pidioActualizar) location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
      // Solo es «nueva» si ya había una versión en uso (la primera vez se instala sin avisar).
      const avisar = (sw: ServiceWorker | null) => sw && navigator.serviceWorker.controller && usePwa.setState({ nueva: sw });
      avisar(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => sw.state === 'installed' && avisar(sw));
      });
      // La app puede quedar abierta días: se busca una versión nueva al volver a ella.
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
    } catch (e) {
      console.warn('Sin service worker', e);
    }
  });
}
