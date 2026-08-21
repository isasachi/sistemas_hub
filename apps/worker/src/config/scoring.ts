// Pesos y umbrales (spec §42-44). Viven acá y NO enterrados en el código: son
// las perillas que se van a mover cuando el ranking no convenza, y buscarlas
// dentro de una fórmula es cómo terminan duplicadas.

/** Puntos de cada señal de ecommerce (spec §23). */
export const ECOMMERCE_WEIGHTS = {
  productSchema: 4,
  price: 3,
  addToCart: 4,
  checkout: 3,
  shipping: 2,
  sku: 2,
  inventory: 2,
  productImages: 1,
} as const

/** Penalizaciones. Fuertes a propósito: una sola hunde el score bajo el umbral. */
export const ECOMMERCE_PENALTIES = {
  appointment: -6,
  servicePage: -6,
  software: -6,
} as const

/**
 * Desde acá arriba, la landing cuenta como ecommerce.
 *
 * ⚠️ CALIBRADO CONTRA 1.548 ANUNCIOS de dos nichos (dental y rodilla), y el 7 se
 * CONFIRMA aunque parezca bajo. La distribución es fuertemente bimodal: 886
 * anuncios puntúan ≤5 (de los cuales 1 solo es físico) y 323 puntúan ≥12 (320
 * físicos). La tentación es subirlo a 12, donde la separación es casi perfecta
 * — pero la banda 7-11 son 24 anuncios y al mirarlos uno por uno son TODOS
 * productos buenos: la pasta dentífrica de ISDIN, el cepillo Oral-B (VTEX, con
 * schema válido), "Dolor OFF 360 Parches", una manta de Amazon. Puntúan poco
 * porque su tienda emite pocas señales de texto, no porque no vendan.
 *
 * Además el gate casi no dispara solo: de 1.243 anuncios analizados, únicamente
 * 1 fue "físico pero no ecommerce". Quien discrimina de verdad es
 * `classifyPhysical` — 70 anuncios son ecommerce SIN ser físicos, que es
 * exactamente la distinción del §24. Esto es un backstop, no el filtro.
 */
export const ECOMMERCE_THRESHOLD = 7

/**
 * ELEGIBILIDAD (spec §43): PASS/FAIL, separado del ranking. Primero se decide
 * si el candidato es válido y recién después se lo puntúa — así ningún score
 * alto rescata un producto que no cumple.
 */
export const ELIGIBILITY = {
  /**
   * ⚠️ BAJADO DE 0,55 A 0,45 CON EVIDENCIA. El 0,55 venía del spec (§43) y
   * cortaba productos legítimos por centésimas: medido sobre el nicho de
   * rodilla, "Dolor OFF 360 Parches de alivio multi-zona" —justo la clase de
   * producto que la herramienta busca— puntúa **0,528** y quedaba afuera por
   * 0,022, mientras "Masajeador Térmico … Alivia el Dolor" pasaba con 0,593.
   * O sea la línea caía en el medio de un grupo homogéneo de aciertos.
   *
   * Debajo hay una discontinuidad real: el siguiente escalón es 0,415 y después
   * cae a 0,26 y a 0,00 (60 anuncios cuyo copy no menciona el tema). 0,45 se
   * apoya en ese hueco: entra el 0,528 con margen y NO entra el grupo de 0,415
   * (blanqueadores dentales para una consulta de dolor de muela, o sea
   * tangenciales).
   *
   * Con 344 anuncios que pasan las Fases 5-6: 0,70 deja 208 · 0,55 deja 242 ·
   * 0,45 deja ~260 · 0,40 dejaría 280.
   */
  minRelevance: 0.45,
  /**
   * ⚠️ HOY ES INERTE, y conviene saberlo antes de creerle. Las fuentes de nombre
   * dan 0,95-0,98 (json-ld), 0,75 (título) o 0,45 (copy del anuncio), pero
   * medido sobre 344 productos resueltos NO EXISTE ninguno de 0,45: el nombre
   * sacado del copy solo ocurre cuando no hay landing legible, y ese caso ya se
   * rechaza antes con NOT_PHYSICAL. El gate solo empezaría a filtrar si algún
   * día se aceptara un anuncio sin landing.
   */
  minProductConfidence: 0.70,
  /**
   * NO se toca: es la definición de monoproducto del §30, no una perilla
   * empírica. Bajarla sería llamar "monoproducto" a un anunciante que reparte
   * su pauta. Medido sobre 132 anunciantes, la mediana de share es 0,633 — o
   * sea el anunciante típico NO es monoproducto, que es justo lo que este
   * filtro existe para detectar. Con 0,70 pasan 64 de 132.
   */
  minProductShare: 0.70,
} as const

/** Monoproducto (spec §30). Se guarda el NÚMERO; esto solo rotula. */
export const MONOPRODUCT = {
  threshold: 0.70,
  strongThreshold: 0.85,
} as const

/** Pesos del opportunity score (spec §44). Suman 1. */
export const OPPORTUNITY_WEIGHTS = {
  relevance: 0.30,
  monoproduct: 0.25,
  longevity: 0.20,
  ecommerce: 0.10,
  advertiserSignal: 0.10,
  geographicSpread: 0.05,
} as const

/**
 * Días corriendo a partir de los cuales la longevidad puntúa 1. 90 es el mismo
 * techo que ya usa `prescore.ts` del motor viejo — no se inventa una escala
 * nueva para la misma señal.
 */
export const LONGEVITY_CAP_DAYS = 90

/** Anuncios activos del anunciante para que `advertiserSignal` puntúe 1. */
export const ADVERTISER_CAP_ADS = 200

/** Países distintos en los que se vio el producto para que el spread sea 1. */
export const GEO_CAP_COUNTRIES = 5
