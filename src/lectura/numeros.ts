// El texto como se dice en voz alta: números en palabras («1984» → «mil novecientos ochenta y
// cuatro»), abreviaturas comunes («Sr.» → «señor») y capítulos en números romanos («Capítulo IV»
// → «capítulo cuatro»). Las voces propias leen letras, no números: sin esto, «210» suena mal.

const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function hasta999(n: number): string {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 30) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }
  return partes.join(' ');
}

/** «uno» se acorta delante de un sustantivo: «veintiún mil», «un millón». */
const apocope = (s: string) => s.replace(/veintiuno$/, 'veintiún').replace(/(^|\s)uno$/, '$1un');

/** Un número entero (hasta 999 999 999 999) en palabras. */
export function enPalabras(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n < 0) return `menos ${enPalabras(-n)}`;
  n = Math.floor(n);
  if (n === 0) return 'cero';
  if (n >= 1e12) return String(n).split('').map((d) => UNIDADES[Number(d)]).join(' ');
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'un millón' : `${apocope(enPalabras(millones))} millones`);
  if (miles) partes.push(miles === 1 ? 'mil' : `${apocope(hasta999(miles))} mil`);
  if (resto) partes.push(hasta999(resto));
  return partes.join(' ');
}

const ROMANOS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
export function romano(s: string): number | null {
  if (!/^[IVXLCDM]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMANOS[s[i]];
    const sig = ROMANOS[s[i + 1]] ?? 0;
    total += v < sig ? -v : v;
  }
  // Solo si está bien escrito (así «MIL» o «DIC» no se toman por números).
  return enRomano(total) === s ? total : null;
}
function enRomano(n: number) {
  const t: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of t)
    while (n >= v) {
      s += r;
      n -= v;
    }
  return s;
}

const ABREVIATURAS: [RegExp, string][] = [
  [/\bSra\./g, 'señora'],
  [/\bSrta\./g, 'señorita'],
  [/\bSres\./g, 'señores'],
  [/\bSr\./g, 'señor'],
  [/\bDra\./g, 'doctora'],
  [/\bDr\./g, 'doctor'],
  [/\bUds\./g, 'ustedes'],
  [/\bUd\./g, 'usted'],
  [/\bVd\./g, 'usted'],
  [/\bD\.ª/g, 'doña'],
  [/\bDña\./g, 'doña'],
  [/\bpágs\./gi, 'páginas'],
  [/\bpág\./gi, 'página'],
  [/\bcap\./gi, 'capítulo'],
  [/\bvol\./gi, 'volumen'],
  [/\bnúm\./gi, 'número'],
  [/\bn\.º\s?/gi, 'número '],
  [/\betc\./g, 'etcétera'],
  [/\baprox\./g, 'aproximadamente'],
  [/\bp\. ej\./g, 'por ejemplo'],
];

/** Palabras tras las que un número romano se lee como número («Capítulo IV», «siglo XX»). */
const ANTES_DE_ROMANO = /\b(cap[ií]tulo|libro|parte|tomo|volumen|siglo|acto|escena|canto|lecci[oó]n|secci[oó]n)(\s+)([IVXLCDM]+)\b/gi;

/** El texto preparado para decirlo en voz alta. */
export function paraLeer(texto: string): string {
  let t = texto;
  for (const [re, palabra] of ABREVIATURAS) t = t.replace(re, palabra);
  t = t.replace(ANTES_DE_ROMANO, (m, palabra: string, esp: string, r: string) => {
    const n = romano(r.toUpperCase() === r ? r : '');
    return n ? `${palabra}${esp}${enPalabras(n)}` : m;
  });
  // Porcentajes, decimales y miles: «12,5 %», «3.5», «1.000.000», «10 000».
  t = t.replace(/(\d+(?:[.,]\d+)?)\s?%/g, '$1 por ciento');
  t = t.replace(/\b\d{1,3}(?:[.   ]\d{3})+\b/g, (m) => m.replace(/[.   ]/g, ''));
  t = t.replace(/\b(\d+)[.,](\d+)\b/g, (_, a: string, b: string) => `${enPalabras(Number(a))} coma ${b.length > 3 ? b.split('').map((d) => UNIDADES[Number(d)]).join(' ') : enPalabras(Number(b))}`);
  // Ordinales cortos: «1.º», «2.ª», «3er», «1er».
  const ORD = ['', 'primer', 'segund', 'tercer', 'cuart', 'quint', 'sext', 'séptim', 'octav', 'noven', 'décim'];
  t = t.replace(/\b(10|[1-9])\.?\s?([ºª°])/g, (_, n: string, g: string) => `${ORD[Number(n)]}${g === 'ª' ? 'a' : 'o'}`);
  t = t.replace(/\b([13])er\b/g, (_, n: string) => (n === '1' ? 'primer' : 'tercer'));
  // Lo que queda: números enteros.
  t = t.replace(/\d+/g, (m) => enPalabras(Number(m)));
  return t;
}
