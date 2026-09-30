// Shaders de la hoja (GLSL ES 1.0, funcionan en WebGL 1 y 2).
//
// Coordenadas: píxeles CSS, origen abajo a la izquierda de la hoja (la de la derecha, en doble
// página), lomo en x = 0. La misma malla sirve para la hoja que se pasa (uDoblar = 1), para la
// página de abajo y para la página izquierda de la doble página (uDesplaza = -ancho).

export const VERTICES = /* glsl */ `
attribute vec2 aUv;
uniform vec2 uTam;      // ancho y alto de la hoja
uniform vec2 uOrigen;   // esquina inferior izquierda de la hoja dentro del lienzo
uniform vec2 uVista;    // tamaño del lienzo
uniform float uZoom;    // acercamiento: pantalla = uPan + uZoom · lienzo
uniform vec2 uPan;
uniform float uDesplaza;// corrimiento en x (la página izquierda va a la izquierda del lomo)
uniform vec2 uN;        // dirección hacia la parte que se levanta
uniform float uA;       // posición del eje del cilindro a lo largo de uN
uniform float uR;       // radio del cilindro
uniform float uDoblar;  // 1: hoja que se dobla; 0: página plana
uniform float uZ;       // altura base
varying vec2 vUv;
varying vec3 vNormal;
varying float vD;
varying vec2 vPos;
varying float vZ;
const float PI = 3.14159265;

void main() {
  vec2 p = aUv * uTam;
  vec3 pos = vec3(p, 0.0);
  vec3 nrm = vec3(0.0, 0.0, 1.0);
  float d = -1.0;
  if (uDoblar > 0.5) {
    d = dot(p, uN) - uA;
    if (d > 0.0) {
      vec2 base = p - uN * d;
      if (uR < 0.5) {
        pos = vec3(base - uN * d, 0.6);
        nrm = vec3(0.0, 0.0, -1.0);
      } else if (d < PI * uR) {
        float t = d / uR;
        pos = vec3(base + uN * uR * sin(t), uR * (1.0 - cos(t)));
        nrm = vec3(-uN * sin(t), cos(t));
      } else {
        pos = vec3(base - uN * (d - PI * uR), 2.0 * uR);
        nrm = vec3(0.0, 0.0, -1.0);
      }
    }
  }
  pos.x += uDesplaza;
  vUv = aUv;
  vNormal = nrm;
  vD = d;
  vPos = pos.xy;
  vZ = pos.z;
  vec2 enLienzo = uPan + uZoom * (pos.xy + uOrigen);
  vec2 clip = enLienzo / uVista * 2.0 - 1.0;
  gl_Position = vec4(clip, -(pos.z + uZ) / 4000.0, 1.0);
}
`;

export const FRAGMENTOS = /* glsl */ `
precision highp float;
uniform sampler2D uPagina;
uniform sampler2D uPapel;
uniform sampler2D uMarcas;        // resaltador y lápiz, sobre blanco: se multiplican con la página
uniform sampler2D uReverso;       // doble página: la página que va al dorso de la hoja
uniform sampler2D uMarcasReverso;
uniform sampler2D uDetalle;       // con zoom: el trozo visible dibujado con más resolución
uniform vec4 uDetalleRect;        // dónde va ese trozo (uv: x0, y0, x1, y1)
uniform float uConDetalle;
uniform float uDobleCara;         // 1 en doble página
uniform float uIzquierda;         // 1 para la página izquierda (el lomo le queda a la derecha)
uniform vec2 uTam;
uniform float uTipo;              // 0 blanco, 1 crema, 2 antiguo, 3 noche
uniform vec3 uFondoNoche;
uniform vec3 uTintaNoche;
uniform float uDoblar;
uniform vec2 uN;
uniform float uA;
uniform float uR;
uniform float uSombra;            // 0..1: intensidad de las sombras del doblez
uniform float uDoblando;          // 1 mientras hay un doblez
uniform vec3 uLuz;
varying vec2 vUv;
varying vec3 vNormal;
varying float vD;
varying vec2 vPos;
varying float vZ;
const float PI = 3.14159265;

// Distancia con signo al rectángulo de la hoja (negativa dentro).
float distCaja(vec2 p) {
  vec2 q = abs(p - uTam * 0.5) - uTam * 0.5;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float mancha(vec2 uv, vec2 c, float r0, float r1, float a) {
  float d = length((uv - c) * uTam);
  return a * (1.0 - smoothstep(r0, r1, d));
}

vec3 papel(vec2 p, vec2 uv) {
  vec3 c = texture2D(uPapel, p / 1024.0).rgb;
  if (uTipo > 1.5 && uTipo < 2.5) {
    // Antiguo: viñeta tostada, bordes quemados y algunas manchitas.
    vec3 tostado = vec3(125.0, 78.0, 26.0) / 255.0;
    vec2 q = (uv - vec2(0.5, 0.54)) / vec2(1.15, 0.95);
    c = mix(c, tostado, smoothstep(0.3, 0.72, length(q)) * 0.34);
    float borde = min(min(p.x, uTam.x - p.x), min(p.y, uTam.y - p.y));
    float grano = texture2D(uPapel, p / 700.0 + 0.37).r;
    c = mix(c, vec3(0.42, 0.26, 0.1), (1.0 - smoothstep(0.0, 9.0, borde + grano * 10.0 - 4.0)) * 0.3);
    vec3 cafe = vec3(146.0, 92.0, 38.0) / 255.0;
    c = mix(c, cafe, mancha(uv, vec2(0.83, 0.83), 5.0, 13.0, 0.2));
    c = mix(c, cafe, mancha(uv, vec2(0.14, 0.36), 3.0, 10.0, 0.14));
    c = mix(c, cafe, mancha(uv, vec2(0.68, 0.14), 7.0, 19.0, 0.13));
    c = mix(c, cafe, mancha(uv, vec2(0.36, 0.7), 10.0, 26.0, 0.08));
  }
  return c;
}

float luminancia(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Tinta del PDF sobre el papel. Claro: multiplicar. Noche: invertir la luz y dar un tono cálido.
vec3 conTinta(vec3 pap, vec3 pdf, float fuerza) {
  if (uTipo > 2.5) {
    float l = luminancia(pdf);
    vec3 inv = clamp(pdf + (1.0 - 2.0 * l), 0.0, 1.0);
    return pap + (uTintaNoche - uFondoNoche) * inv * fuerza;
  }
  return pap * mix(vec3(1.0), pdf, fuerza);
}

void main() {
  bool reverso = uDoblar > 0.5 && !gl_FrontFacing;
  // En doble página el dorso de la hoja es la página siguiente (se lee derecha cuando cae a la izquierda).
  bool verso = reverso && uDobleCara > 0.5;
  vec2 uv = verso ? vec2(1.0 - vUv.x, vUv.y) : vUv;
  vec2 p = uv * uTam;
  vec3 pap = papel(p, uv);
  // Las marcas van antes del papel: así en «noche» también se invierten y siguen viéndose.
  vec3 pdf;
  if (verso) {
    pdf = texture2D(uReverso, uv).rgb * texture2D(uMarcasReverso, uv).rgb;
  } else {
    vec3 base = texture2D(uPagina, uv).rgb;
    if (uConDetalle > 0.5) {
      vec2 q = (uv - uDetalleRect.xy) / (uDetalleRect.zw - uDetalleRect.xy);
      if (q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0) base = texture2D(uDetalle, q).rgb;
    }
    pdf = base * texture2D(uMarcas, uv).rgb;
  }
  vec3 col;
  if (reverso && !verso) {
    // El reverso (una página): papel con el texto de la cara, al revés, apenas visible.
    col = conTinta(pap, pdf, 0.1);
  } else {
    col = conTinta(pap, pdf, 1.0);
    // Sombra del lomo y cantos de las hojas de abajo.
    float aLomo = (uIzquierda > 0.5 || verso) ? uTam.x - p.x : p.x;
    float lomo = 1.0 - smoothstep(0.0, 22.0, aLomo);
    col = mix(col, vec3(80.0, 55.0, 25.0) / 255.0 * (uTipo > 2.5 ? 0.2 : 1.0), lomo * 0.13);
    float aCanto = uTam.x - aLomo;
    float canto = step(aCanto, 5.0) * step(0.5, fract(aCanto * 0.5));
    col *= 1.0 - canto * 0.07;
  }

  if (uDoblar > 0.5 && vD > 0.0) {
    // Luz sobre la curva: 1 en lo plano, más clara o más oscura según mire la superficie.
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    float dif = max(dot(N, uLuz), 0.0);
    float luz = (0.5 + 0.5 * dif) / (0.5 + 0.5 * uLuz.z);
    vec3 H = normalize(uLuz + vec3(0.0, 0.0, 1.0));
    float brillo = pow(max(dot(N, H), 0.0), 28.0) * 0.1 * step(0.5, uR);
    col = col * luz + brillo * (uTipo > 2.5 ? 0.35 : 1.0);
    // La cara de adentro del rollo queda en penumbra.
    if (gl_FrontFacing) col *= 1.0 - 0.18 * smoothstep(0.0, 1.0, vZ / max(uR, 1.0));
  }

  if (uDoblando > 0.5) {
    float s = dot(vPos, uN) - uA;
    if ((uDoblar > 0.5 && vD <= 0.0) || uIzquierda > 0.5) {
      // Sobre lo plano (la hoja o la página izquierda): sombra del pedazo que ya se dio vuelta.
      if (s < 0.0) {
        vec2 m = vPos + uN * (PI * uR - 2.0 * s);
        float borde = distCaja(m);
        float ancho = 5.0 + uR * 0.9;
        float somb = (1.0 - smoothstep(-1.0, ancho, borde)) * 0.22;
        // Penumbra suave junto al doblez.
        somb += (1.0 - smoothstep(0.0, 3.0 + uR * 0.6, -s)) * 0.08 * step(0.5, uR) * (1.0 - uIzquierda);
        col *= 1.0 - somb * uSombra;
      }
    } else if (uDoblar < 0.5 && s > 0.0) {
      // Sobre la página de abajo: sombra que proyecta el rollo.
      float ancho = 14.0 + uR * 1.6;
      float somb = 1.0 - smoothstep(uR * 0.55, uR + ancho, s);
      somb *= somb;
      vec2 eje = vPos - uN * s;
      somb *= 1.0 - smoothstep(-2.0, 10.0 + uR * 0.5, distCaja(eje));
      col *= 1.0 - somb * 0.42 * uSombra;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
