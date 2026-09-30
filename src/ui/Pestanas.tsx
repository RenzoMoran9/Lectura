// Pestañas de abajo: «Estante» y «Mis frases».

import { useLibros } from '../estado/libros';
import { Icono } from './Icono';

export function Pestanas({ actual }: { actual: 'inicio' | 'frases' }) {
  const pestana = useLibros((s) => s.pestana);
  return (
    <nav className="pestanas" aria-label="Secciones">
      <button className={actual === 'inicio' ? 'on' : ''} aria-current={actual === 'inicio' ? 'page' : undefined} onClick={() => pestana('inicio')}>
        <Icono nombre="library" tam={24} />
        Estante
      </button>
      <button className={actual === 'frases' ? 'on' : ''} aria-current={actual === 'frases' ? 'page' : undefined} onClick={() => pestana('frases')}>
        <Icono nombre="quote" tam={24} />
        Mis frases
      </button>
    </nav>
  );
}
