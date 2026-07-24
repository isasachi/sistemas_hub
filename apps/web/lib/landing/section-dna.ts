import type { SectionType } from './types'

// ADN por sección extraído de las 8 plantillas CLEARSTEM Celestial (2026-07-23). FUENTE ÚNICA: lo
// importan el paso de IMAGEN (refuerzo compositivo, `instructions.ts`) y el de COPY (fuente de
// verdad de estructura, `copy.ts`). Reemplaza al viejo `SECTION_SPECS_TEXT` (one-liner por sección).
//
// - `composition`: checklist ESTRUCTURAL enumerable (conteos, roles, presencia/ausencia, qué va al
//   centro) que la difusión no debe perder ni descontar. NO re-describe espaciado, posición fina ni
//   tratamiento — eso lo manda la PLANTILLA adjunta (el motor plantilla-como-scaffold). Es refuerzo,
//   no re-pintado del layout (evita reconstruir el MASTER_LAYOUT que peleaba con la plantilla).
// - `copy`: estructura FIJA del copy (campos + conteos + patrón). Es la fuente de verdad del step de
//   copy: manda compositiva/estructuralmente; el WORDING varía por nicho/producto. Los conteos deben
//   coincidir con lo ya enforced en código: bullets hero/beneficios/cta-final vía `shareBullets`
//   (4/5/4), y oferta vía `OfferGenSchema` (3 tiers, 1 featured) + `recomputeSavings` — el copy DNA
//   de oferta NO redefine los tiers (los produce `generateOfferCopy`), solo el marco (urgency/kicker).
export interface SectionDna {
  composition: string[]
  copy: string
  // Conteos DUROS de arrays (fuente de verdad machine-checkable): alimentan el checklist del prompt
  // Y la validación post-generación (`missingStructure` en copy.ts) — si el modelo devuelve menos,
  // se hace un retry correctivo. Se validan DESPUÉS de `shareBullets` (que sincroniza cta-final←hero).
  // oferta no lleva `requires`: sus tiers los produce el flujo OfferGenSchema, no generateLandingCopy.
  requires?: { bullets?: number; bulletsAfter?: number; cards?: number }
}

export const SECTION_DNA: Record<SectionType, SectionDna> = {
  hero: {
    composition: [
      'Titular de 3-4 líneas cortas arriba-izquierda; subtítulo debajo con un subrayado dorado fino',
      'Talento a la derecha, recortado a la altura del hombro, con sangrado superior/derecho',
      'Producto en el cuadrante inferior izquierdo',
      'UNA card glass abajo-derecha con EXACTAMENTE 4 bullets (círculo de icono + 2 líneas cada uno)',
      'Barra de confianza inferior + pastilla inferior "Recomendado por expertos"',
      'SIN botón CTA — el hero solo presenta',
    ],
    copy: 'headline: 2-3 cláusulas MUY cortas separadas por coma, ≤50 caracteres EN TOTAL, siempre una frase COMPLETA (nunca la dejes a medias ni la cortes). accentWord: 1-2 palabras del titular = el PROBLEMA o la TRANSFORMACIÓN (nunca la marca). subheadline: 1-2 líneas cortas, ≤75 caracteres, completa. bullets: EXACTAMENTE 4, cada uno una acción de 2-4 palabras (línea bold) + un complemento de 2-4 palabras (línea light). SIN cta. Prioriza que TODO el texto entre completo antes que meter más palabras.',
    requires: { bullets: 4 },
  },
  beneficios: {
    composition: [
      'Titular arriba-izquierda + kicker dorado con guiones laterales "— TEXTO —"',
      'Columna izquierda con EXACTAMENTE 5 bullets (icono + 2 líneas), separados por líneas finas',
      'UNA closing card aparte, abajo-izquierda: icono de gota dorada + frase bold + subcopy',
      'Talento a la derecha, producto centro-derecha',
      'Barra de confianza inferior + pastilla "Recomendado por expertos"',
    ],
    copy: 'headline. kicker: frase corta en mayúsculas para la banda dorada (ej "— RESULTADOS REALES —"). bullets: EXACTAMENTE 5 con el mismo patrón bold+light del hero (los primeros 4 = los del hero). closingBold: frase de cierre en bold. closingSub: subcopy de una línea que la acompaña.',
    requires: { bullets: 5 },
  },
  'antes-despues': {
    composition: [
      'Titular de 2 líneas arriba + kicker dorado con guiones',
      'DOS paneles lado a lado: "ANTES" (etiqueta gris) y "DESPUÉS" (etiqueta dorada), cada uno con foto del sujeto',
      'Un círculo con chevron »» entre los dos paneles',
      'Bajo cada panel, una lista de EXACTAMENTE 4 ítems (✗ en el ANTES, ✓ en el DESPUÉS), pareados',
      'Producto centrado en la parte inferior',
      'Franja de cierre inferior (banda sólida, texto en mayúsculas) — REEMPLAZA a la barra de confianza; sin pastilla de expertos',
    ],
    copy: 'headline: 2 líneas. kicker. bullets: EXACTAMENTE 4 = problemas del estado ANTES (frases cortas). bulletsAfter: EXACTAMENTE 4 = resultados del estado DESPUÉS, pareados 1:1 con los ANTES. closingStrip: una frase en MAYÚSCULAS para la franja de cierre.',
    requires: { bullets: 4, bulletsAfter: 4 },
  },
  testimonios: {
    composition: [
      'Titular de 3 líneas arriba + kicker dorado con guiones',
      'EXACTAMENTE 3 cards de testimonio: avatar circular + 5 estrellas doradas + insignia "Compra Verificada" + quote + autor "Nombre – Ciudad" + banderita',
      'Producto ocupando la columna derecha completa',
      'Banda de prueba social (escudo + frase) sobre la barra de confianza',
      'Barra de confianza inferior + pastilla "Recomendado por expertos"',
      'SIN el protagonista de la campaña — las únicas caras son las de los 3 clientes (distintas entre sí)',
    ],
    copy: 'headline: 3 líneas. kicker. cards: EXACTAMENTE 3 (ni 2 ni 4 — SIEMPRE 3) testimonios de MUESTRA (contenido de plantilla que el vendedor editará/reemplazará por reseñas reales — NO son reseñas de personas reales, así que DEBES generar las 3 aunque tengas que inventarlas), cada una title="Nombre A. – Ciudad" (nombres peruanos ficticios, ciudades distintas) y body=quote corta de 2-3 líneas en primera persona que cubran ejes distintos (resultado, objeción resuelta, emoción). socialProof: una frase agregada (ej "Miles de personas ya…").'
    ,requires: { cards: 3 },
  },
  faq: {
    composition: [
      'Titular de 2 líneas arriba + subcopy de 1-2 líneas',
      'EXACTAMENTE 5 items apilados: círculo de icono + pregunta en bold + respuesta de 2 líneas + un "+" decorativo a la derecha',
      'Producto pequeño en la esquina inferior derecha (más chico que en el resto)',
      'Barra de confianza inferior + pastilla "Recomendado por expertos"',
      'SIN persona alguna',
    ],
    copy: 'headline: 2 líneas cortas. subheadline: 1 línea corta. cards: EXACTAMENTE 5, title=pregunta corta (1-2 líneas), body=respuesta de 1-2 líneas MUY cortas (≤75 caracteres, SIEMPRE completa — nunca la cortes) que resuelve una objeción real de forma literal.',
    requires: { cards: 5 },
  },
  garantia: {
    composition: [
      'Titular de 2 líneas arriba + subcopy',
      'EXACTAMENTE 4 cards horizontales: icono grande (de color DISTINTO por card) a la izquierda + título + descripción',
      'Sello de garantía dorado a la derecha (porcentaje grande + texto superior + cinta inferior)',
      'Producto en la parte inferior derecha',
      'Barra de confianza inferior (la banda de pago queda limpia, sin logos) + pastilla "Recomendado por expertos"',
      'SIN persona alguna',
    ],
    copy: 'headline: 2 líneas. subheadline. cards: EXACTAMENTE 4, title (2-4 palabras) + description (1-2 líneas). El sello es fijo (100% de satisfacción / devolución) — no requiere copy nuevo.',
    requires: { cards: 4 },
  },
  oferta: {
    composition: [
      'Badge de urgencia dorado en la parte superior (con icono de gota)',
      'Titular + kicker dorado',
      'EXACTAMENTE 3 columnas de precio; la CENTRAL elevada y enmarcada en oro, con cinta "Recomendado"/"3x2" arriba y "Mejor valor" abajo y CTA dorado; las laterales con CTA en color de acento',
      'Cada columna: cinta de % de ahorro, cantidad, precio ancla tachado, precio actual gigante, precio por unidad, botón',
      'Columna izquierda mini-trust de 3 ítems (icono + título + microcopy)',
      'Fila de logos de pago + sello de garantía + talento inferior derecho',
      'SIN barra de confianza inferior ni pastilla de expertos (ocupadas por payment_row / sello)',
    ],
    copy: 'headline. kicker. urgency: la línea del badge (ej "Oferta solo hoy"). Los 3 tiers (label/price/priceBefore/savingsPct/perUnit/cta, exactamente 1 featured=central) los produce el flujo de oferta (OfferGenSchema + recomputeSavings) — el copy DNA NO los reescribe; solo aporta el marco (headline/kicker/urgency).',
  },
  'cta-final': {
    composition: [
      'Titular de 3 líneas arriba-izquierda + subcopy',
      'EXACTAMENTE 4 bullets a la izquierda (los MISMOS del hero)',
      'Pack de producto (varias unidades) a la derecha',
      'Bloque de oferta condensada (el tier destacado)',
      'Bloque CTA: titular en MAYÚSCULAS + subcopy + botón de ancho completo con icono de carrito (único con botón full-width)',
      'Refuerzo de garantía (sello) + barra de confianza inferior + pastilla "Recomendado por expertos"',
      'SIN persona alguna; franja superior reservada para el lockup de marca (se compone aparte)',
    ],
    copy: 'headline: 3 líneas. subheadline. bullets: EXACTAMENTE 4 = los MISMOS del hero (los sincroniza shareBullets, no los reescribas distinto). ctaHeadline: llamada en MAYÚSCULAS (ej "¡PIDE EL TUYO AHORA!"). ctaSub: 1 línea. cta: etiqueta corta del botón.',
    requires: { bullets: 4 },
  },
}
