import { z } from 'zod'

// ─── Eje de ESTILO / dirección de arte (2026-08-15) ──────────────────────────
//
// POR QUÉ EXISTE: hasta acá la marca solo movía COLOR, tipografía, halo y densidad de partículas.
// Todo el LENGUAJE MATERIAL estaba hardcodeado en `designSystemBlock` ("glassmorphism siempre,
// card sólida nunca", "círculo 3D glossy", glow, sombra teñida), idéntico en las 8 secciones y en
// todas las sesiones. Dos marcas de carácter opuesto recibían el MISMO prompt de materiales y solo
// cambiaban los hex — un re-tinte, no una identidad. Este eje es lo que distingue una landing de
// otra sin tocar la estructura.
//
// ⚠️ LÍMITE DURO — MATERIAL, NUNCA GEOMETRÍA. La composición la manda la PLANTILLA adjunta (imagen
// ráster) y la difusión le hace caso a la imagen por encima del texto: eso ya se perdió una vez con
// la tonalidad, y por eso existe el ⚠️ TONALIDAD ≠ ESTRUCTURA de `templateNote`. Así que este eje
// solo toca atributos que el texto PUEDE ganar (acabado de superficie, relleno del icono, textura
// del fondo, carácter de la luz, expresión tipográfica) y deja intacto lo que la plantilla muestra
// literalmente: radio de esquina, anatomía de card, cinta, chevron, pills, columnas de precio.
// El acabado de card es el diferenciador de más señal Y pelea con la plantilla → lleva su propio
// carve-out ⚠️ ACABADO ≠ ESTRUCTURA, calcado del de tonalidad, que es el patrón ya probado.
//
// Lo que este eje NO toca en v1: la BANDA METÁLICA de confianza. Está declarada invariante en dos
// lugares que tienen que decir lo mismo (`designSystemBlock` y `trustText`, ambos vía `moneyRamp`);
// si se toca, se tocan los dos o el prompt se contradice solo.
export const BrandStyle = z.enum([
  'glass_premium',
  'editorial_clean',
  'natural_organic',
  'bold_impact',
  'tech_precision',
])
export type BrandStyle = z.infer<typeof BrandStyle>

// `glass_premium` = el comportamiento HISTÓRICO exacto. Es el valor al que caen las sesiones sin
// marca y el ADN legado (`getLandingSession` castea sin `.parse()`, así que ningún `.default()` de
// zod corre al leer — se defaultea en el SITIO DE USO, ver `styleOf`).
export const DEFAULT_STYLE: BrandStyle = 'glass_premium'

export interface StyleDna {
  /** Nombre corto en español; lo usa el carve-out de plantilla para nombrar el acabado. */
  name: string
  /** Material y acabado de la superficie de card. Pelea con la plantilla → necesita el carve-out. */
  surface: string
  /** Relleno/tratamiento del icono (no su tamaño ni su posición, que los manda la plantilla). */
  icon: string
  /** Textura y atmósfera del fondo, encima del degradado de la paleta. */
  background: string
  /** Carácter de la luz de la escena. */
  light: string
  /** Expresión tipográfica: pesos, tracking y contraste. La FAMILIA la manda la marca. */
  type: string
  /**
   * Recorrido de LUMINOSIDAD del degradado de fondo, de arriba hacia abajo, en puntos de L.
   * Positivo = el borde inferior ACLARA (aire); negativo = OSCURECE (profundidad, viñeta).
   *
   * ⚠️ ESTO ES LA PERILLA DEL CONTRASTE DE ESCENA, no `light`. Medido: `light` describe la luz en
   * prosa y el modelo la ignora, porque el mismo prompt le entrega `bg_start`/`bg_end` como colores
   * EXACTOS ("no una sugerencia aproximada") — y dos casi-blancos separados por 8 puntos SON una
   * escena de bajo contraste, le digas lo que le digas. Con la instrucción idéntica palabra por
   * palabra, `L 90→98` sale plana y `L 90→30` sale con profundidad real.
   *
   * El valor se expresa para una pieza CLARA; en una OSCURA se invierte el signo, para que la
   * relación con el fondo se conserve. Así `glass_premium` (+8) da 90→98 en claro y 12→4 en oscuro:
   * exactamente el comportamiento histórico en las dos polaridades.
   *
   * ⚠️ El extremo que se mueve es SIEMPRE el de ABAJO. `fitHeadline` garantiza 7:1 del titular
   * contra `bg_start`, y su loop resta luminosidad cuando la pieza es clara: oscurecer el extremo
   * de ARRIBA lo empuja al lado contrario y deja el titular ilegible (visto en un render).
   */
  bgDeltaL: number
}

export const STYLE_DNA: Record<BrandStyle, StyleDna> = {
  glass_premium: {
    name: 'vidrio esmerilado premium',
    surface:
      'relleno translúcido de vidrio esmerilado al 75-85% de opacidad, borde blanco de 1px, sombra difusa teñida del acento y leve glow — glassmorphism, nunca una card sólida opaca.',
    icon: 'círculo 3D glossy con degradado del color asignado, símbolo blanco en relieve y sombra interior.',
    background: 'bruma atmosférica suave y bokeh tenue sobre el degradado; sin textura de material.',
    light: 'luz difusa envolvente de estudio, sombras suaves y reflejos húmedos.',
    type: 'contraste alto de PESO entre el titular extrabold y el cuerpo regular; tracking normal.',
    bgDeltaL: 8,    // el histórico (`GRADIENT_DELTA`): el borde inferior aclara, aire pálido
  },
  editorial_clean: {
    name: 'editorial limpio',
    surface:
      'superficie MATE y sólida en el color de superficie, borde hairline de 1px en el tono del titular al 15%, sin glow y sin sombra de color — a lo sumo una sombra apenas perceptible. Nada de vidrio esmerilado, nada de translucidez.',
    icon: 'pictograma de LÍNEA fina monocroma en el color asignado, sin círculo de fondo, sin relieve, sin brillo ni degradado.',
    background:
      'degradado casi imperceptible y aire limpio y generoso; sin bruma, sin bokeh, sin grano, sin textura de material.',
    light: 'luz de estudio neutra y pareja, sombras cortas y limpias, cero dramatismo.',
    type: 'jerarquía por TAMAÑO y espacio antes que por peso: titular en peso medio, interlineado amplio, cuerpo ligero.',
    bgDeltaL: 4,    // aún más plano: el aire lo da el espacio, no el degradado
  },
  natural_organic: {
    name: 'natural artesanal',
    surface:
      'superficie MATE con textura fina de papel o cartón sin blanquear, borde suave o directamente sin borde, sombra cálida corta y difusa. Nada de vidrio, nada de glow, nada de brillo plástico.',
    icon: 'símbolo de trazo orgánico dentro de una forma irregular tipo sello estampado, en tinta del color asignado; acabado plano y mate.',
    background: 'grano fino visible y textura de fibra de papel sobre el degradado, como luz entrando por una ventana.',
    light: 'luz natural de día, cálida y direccional suave, con sombras de contacto reales y contraste orgánico.',
    type: 'titular semibold generoso y cuerpo relajado; se admite tracking abierto en el microcopy.',
    bgDeltaL: -14,  // caída cálida y corta hacia abajo, como luz entrando por una ventana
  },
  bold_impact: {
    name: 'impacto sólido',
    surface:
      'BLOQUE SÓLIDO 100% opaco en el color de superficie o del acento, borde grueso o sin borde, y sombra DURA desplazada (offset nítido, sin difuminar). Nunca vidrio, nunca translúcido, nunca glow.',
    icon: 'símbolo macizo de alto contraste sobre una forma sólida y compacta, relleno pleno del color asignado, sin degradado ni brillo.',
    background: 'alto contraste con viñeta marcada y foco duro sobre el producto; sin bruma lechosa ni bokeh suave.',
    light: 'luz direccional dura de estudio deportivo: sombras definidas, alto contraste, borde de luz marcado.',
    type: 'titular extrabold dominante con tracking cerrado y cuerpo notablemente menor — la jerarquía grita.',
    bgDeltaL: -60,  // medido: es el valor con el que la escena gana profundidad y contraste reales
  },
  tech_precision: {
    name: 'técnico de precisión',
    surface:
      'superficie MATE casi plana, borde nítido de 1px en el color de acento al 40%, sin glow, sin sombra de color y sin vidrio esmerilado.',
    icon: 'pictograma geométrico monolineal de grosor constante en el color asignado, sobre fondo transparente o sobre un cuadrado mate.',
    background: 'degradado frío y limpio con una retícula técnica apenas visible; sin bruma cálida.',
    light: 'luz fría y controlada con filo de luz (rim) en el borde del producto y reflejos especulares cortos y precisos.',
    type: 'titular condensado de peso alto; microcopy en mayúsculas con tracking ligeramente abierto, cifras y unidades con presencia.',
    bgDeltaL: -38,  // caída fría y marcada, para el filo de luz y los especulares
  },
}

// Sitio de uso único: resuelve el estilo tolerando `undefined` (ADN legado / sesión sin marca).
export function styleOf(style: BrandStyle | undefined): StyleDna {
  return STYLE_DNA[style ?? DEFAULT_STYLE]
}
