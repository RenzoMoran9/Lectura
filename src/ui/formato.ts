// Números y tamaños como se leen en español.

export const tamanoLegible = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

/** 1056 → «1 056» (espacio fino, como en la propuesta visual). */
export const miles = (n: number) => n.toLocaleString('es').replace(/[.,\u00a0]/g, '\u202f');
