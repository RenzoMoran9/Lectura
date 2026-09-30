import { useEffect } from 'react';
import { useFrases } from './estado/frases';
import { useLibros } from './estado/libros';
import { Inicio } from './ui/Inicio';
import { Lector } from './ui/Lector';
import { MisFrases } from './ui/MisFrases';

export function App() {
  const vista = useLibros((s) => s.vista);
  const cargar = useLibros((s) => s.cargar);

  useEffect(() => {
    void cargar();
    void useFrases.getState().cargar();
  }, [cargar]);

  if (vista.pantalla === 'lector')
    return <Lector key={`${vista.libroId}-${vista.vez ?? 0}`} libroId={vista.libroId} paginaPedida={vista.pagina} desde={vista.desde} />;
  if (vista.pantalla === 'frases') return <MisFrases libroId={vista.libroId} />;
  return <Inicio />;
}
