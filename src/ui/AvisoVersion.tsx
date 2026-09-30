// «Nueva versión · Actualizar»: aparece cuando se publicó una versión nueva de la app.

import { usePwa } from '../pwa/pwa';
import { Icono } from './Icono';

export function AvisoVersion() {
  const { nueva, actualizar } = usePwa();
  if (!nueva) return null;
  return (
    <div className="aviso-version" role="status">
      <Icono nombre="sparkles" tam={15} />
      <span>Hay una versión nueva</span>
      <button onClick={actualizar}>Actualizar</button>
    </div>
  );
}
