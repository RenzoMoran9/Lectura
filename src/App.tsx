import { useEffect } from 'react';
import { useFrases } from './estado/frases';
import { useLibros } from './estado/libros';
import { AvisoVersion } from './ui/AvisoVersion';
import { Inicio } from './ui/Inicio';
import { Lector } from './ui/Lector';
import { MisFrases } from './ui/MisFrases';

export function App() {
  const vista = useLibros((s) => s.vista);
  const cargar = useLibros((s) => s.cargar);

  useEffect(() => {
    // Al abrir la app se busca la portada original de los libros que aún no la tienen.
    void cargar().then(() => useLibros.getState().completarPortadas());
    void useFrases.getState().cargar();
    const alConectar = () => void useLibros.getState().completarPortadas();
    window.addEventListener('online', alConectar);
    return () => window.removeEventListener('online', alConectar);
  }, [cargar]);

  if (vista.pantalla === 'lector')
    return <Lector key={`${vista.libroId}-${vista.vez ?? 0}`} libroId={vista.libroId} paginaPedida={vista.pagina} desde={vista.desde} />;
  return (
    <>
      {vista.pantalla === 'frases' ? <MisFrases libroId={vista.libroId} /> : <Inicio />}
      <AvisoVersion />
    </>
  );
}
