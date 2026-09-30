import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useAjustes } from './estado/ajustes';
import { instalarTexturasCss } from './hoja/papel';
import { sonido } from './sonido/sonido';
import './estilos.css';

instalarTexturasCss();

// El motor de sonido sigue a los ajustes guardados.
const aplicarSonido = () => {
  const { sonido: activo, volumen, juego } = useAjustes.getState();
  sonido.activo = activo;
  sonido.volumen = volumen;
  if (sonido.juego !== juego) sonido.cambiarJuego(juego);
};
aplicarSonido();
useAjustes.subscribe(aplicarSonido);

// Las letras de la app se usan también dentro de la hoja (título y número de página).
void Promise.all(['600 12px Fraunces', '400 12px Fraunces'].map((f) => document.fonts.load(f))).catch(() => {});

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
