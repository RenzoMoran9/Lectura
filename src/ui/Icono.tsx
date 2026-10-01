// Íconos de Lucide (https://lucide.dev, licencia ISC), más «encerrar», propio.

const TRAZOS = {
  'chevron-left': '<path d="m15 18-6-6 6-6" />',
  'arrow-right': '<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />',
  plus: '<path d="M5 12h14" /><path d="M12 5v14" />',
  file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" />',
  'volume-2': '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" />',
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />',
  check: '<path d="M20 6 9 17l-5-5" />',
  x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
  'book-open': '<path d="M12 5v16" /><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />',
  trash: '<path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />',
  upload: '<path d="M12 3v12" /><path d="m17 8-5-5-5 5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />',
  highlighter: '<path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />',
  eraser: '<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" /><path d="m5.082 11.09 8.828 8.828" />',
  quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" /><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />',
  shuffle: '<path d="m18 14 4 4-4 4" /><path d="m18 2 4 4-4 4" /><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" /><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" /><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />',
  search: '<path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" />',
  'undo-2': '<path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />',
  'panel-right': '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M15 3v18" />',
  library: '<path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" />',
  'more-horizontal': '<circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />',
  sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /><path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" />',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
  'zoom-in': '<circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="11" x2="11" y1="8" y2="14" /><line x1="8" x2="14" y1="11" y2="11" />',
  download: '<path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" />',
  'volume-x': '<path d="M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z" /><path d="m16.5 14.5 5-5" /><path d="m16.5 9.5 5 5" />',
  waves: '<path d="M2 12q2.5 2 5 0t5 0 5 0 5 0" /><path d="M2 19q2.5 2 5 0t5 0 5 0 5 0" /><path d="M2 5q2.5 2 5 0t5 0 5 0 5 0" />',
  'flame-kindling': '<path d="M12 2c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 17 10a5 5 0 1 1-10 0c0-.3 0-.6.1-.9a2 2 0 1 0 3.3-2C8 4.5 11 2 12 2Z" /><path d="m5 22 14-4" /><path d="m5 18 14 4" />',
  'cloud-rain': '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M16 14v6" /><path d="M8 14v6" /><path d="M12 16v6" />',
  ghost: '<path d="M15 10v1" /><path d="M7.528 20.472a1.6 1.6 0 012.277 0l1.057 1.056a1.6 1.6 0 002.276 0l1.057-1.056a1.6 1.6 0 012.277 0l1.114 1.114a1.4 1.4 0 002.414-1V10a8 8 0 00-16 0v10.586a1.4 1.4 0 002.414 1z" /><path d="M9 10v1" />',
  hourglass: '<path d="M5 22h14" /><path d="M5 2h14" /><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" /><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />',
  drama: '<path d="M10 11h.01" /><path d="M14 6h.01" /><path d="M18 6h.01" /><path d="M6.5 13.1h.01" /><path d="M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3" /><path d="M17.4 9.9c-.8.8-2 .8-2.8 0" /><path d="M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7" /><path d="M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4" />',
  swords: '<path d="m13 19 6-6" /><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5" /><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /><path d="m5 14 4 4" /><path d="m5 21-2-2" /><path d="M7.5 16.5 4 20" />',
  luna: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />',
  reloj: '<circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />',
  lista: '<path d="M3 5h.01" /><path d="M3 12h.01" /><path d="M3 19h.01" /><path d="M8 5h13" /><path d="M8 12h13" /><path d="M8 19h13" />',
  // Propio (de la propuesta visual): un óvalo a lápiz alrededor de dos renglones.
  encerrar: '<path d="M6.2 18.6C3.7 17.4 2 15.2 2 12.6 2 8.6 6.5 5.5 12 5.5s10 3.1 10 7.1-4.5 7.1-10 7.1c-1.4 0-2.8-.2-4-.6" /><path d="M7.5 11h9" /><path d="M7.5 14.4h5.5" />',
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tam = 20, grosor = 1.9, className }: { nombre: NombreIcono; tam?: number; grosor?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: TRAZOS[nombre] }}
    />
  );
}
