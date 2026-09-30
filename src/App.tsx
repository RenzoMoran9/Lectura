import { useEffect } from 'react';
import { useLibros } from './estado/libros';
import { Inicio } from './ui/Inicio';
import { Lector } from './ui/Lector';

export function App() {
  const vista = useLibros((s) => s.vista);
  const cargar = useLibros((s) => s.cargar);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return vista.pantalla === 'lector' ? <Lector key={vista.libroId} libroId={vista.libroId} /> : <Inicio />;
}
