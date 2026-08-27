import { z } from 'zod'
import { BodyFocus } from '@/lib/body-focus'
// Solo tipo: `brand-system.ts` arrastra gemini/storage y este módulo lo consume el cliente.
import type { BrandSystem } from '@/lib/branding/brand-system'
// Enum liviano (sin gemini/storage detrás), así que sí se puede importar como VALOR desde acá.
import { BrandStyle } from './style-dna'

// ─── Catálogo de secciones ───────────────────────────────────────────────────
// El orden del enum NO es el orden de la landing — ese lo define `order` por sesión.
export const SectionType = z.enum([
  'hero',
  'oferta',
  'antes-despues',
  'beneficios',
  'testimonios',
  'faq',
  'garantia',
  'cta-final',
])
export type SectionType = z.infer<typeof SectionType>

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero',
  oferta: 'Oferta',
  'antes-despues': 'Antes y después',
  beneficios: 'Beneficios',
  testimonios: 'Testimonios',
  faq: 'Preguntas frecuentes',
  garantia: 'Garantía',
  'cta-final': 'Llamado final',
}

// ─── Nicho y demografía (spec 2026-07-23, Anexos A/B) ────────────────────────
export const NicheId = z.enum([
  // `supplement_skin_female` es el suplemento de BELLEZA (piel, cabello, uñas). `supplement_female`
  // es el resto del bienestar femenino —sueño, hormonas, energía, hierro, ciclo—, que antes caía en
  // el de belleza por no tener casillero propio: la sesión de GomiSleep (magnesio para dormir) salió
  // clasificada como belleza/piel, y de ahí heredaba tipografía, props y vestuario de skincare.
  // `supplement_male` es el simétrico masculino, y nació del mismo fallo del otro lado: unas gomitas
  // de melatonina para hombres no tenían más casillero que `supplement_male_performance`, cuyo
  // vestuario de nicho es "camiseta deportiva ajustada o musculosa" — de ahí el avatar de gimnasio
  // en un anuncio para dormir.
  'supplement_skin_female', 'supplement_female', 'skincare_topical', 'haircare',
  'fitness_weightloss', 'supplement_male_performance', 'supplement_male',
  'joint_mobility', 'intimate_wellness', 'herbal_natural',
  'baby_maternity', 'pets', 'home_cleaning',
  'tech_gadgets', 'kitchen_tools', 'jewelry_fashion',
  'automotive', 'generic',
])
export type NicheId = z.infer<typeof NicheId>

export const DemographicId = z.enum([
  'female_18_30', 'female_30_45', 'female_45_plus',
  'male_20_35', 'male_35_55', 'senior_55_plus', 'no_talent',
])
export type DemographicId = z.infer<typeof DemographicId>

// ─── Zona del cuerpo sobre la que actúa el producto (2026-08-15) ─────────────
// El eje que faltaba. `DEMOGRAPHIC_POSES` mezclaba dos cosas: la ACTITUD (que sí es demográfica) y
// el ENCUADRE (que no lo es). Sin este campo, una `female_18_30` recibía siempre poses de rostro
// —"mano en la mejilla", "ambas manos enmarcando el rostro"— fuera un sérum para el acné o una
// creatina para glúteos, y una rodillera salía con un retrato en vez de una rodilla.
//
// La definición se mudó a `lib/body-focus.ts` (módulo hoja) para que el generador de anuncios use
// EL MISMO vocabulario sin arrastrar la cadena de imports de este archivo. Se re-exporta acá
// porque medio landing lo importa desde `@/lib/landing/types`.
export { BodyFocus }

// Salida del paso 0.a (clasificación). Zod rechaza cualquier valor fuera del set.
export const NicheClassification = z.object({
  niche_id: NicheId,
  demographic_id: DemographicId,
  // OBLIGATORIO a propósito. Un `.optional()` no entra en el `required` del JSON Schema que
  // `callStructured` le pasa al modelo, y lo que no se le exige lo omite en silencio: el campo
  // llegaría siempre vacío, todo caería al default `rostro` y el eje entero quedaría en no-op con
  // el síntoma idéntico al bug que vino a arreglar. Ya pasó con `style` en el ADN de marca.
  body_focus: BodyFocus,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(200),
})
export type NicheClassification = z.infer<typeof NicheClassification>

// Densidad de partículas (spec 0.b C).
export const ParticleDensity = z.enum(['low', 'medium', 'high'])
export const Halo = z.enum(['radial_soft', 'rays', 'backlight', 'rim', 'none'])

// Polaridad del sistema (decisión #9, 2026-08-07): una marca oscura da una landing oscura. La
// declara el sistema de marca (`BrandSystem.polarity`); sin marca es siempre 'light', que es como
// se comportó la tool desde siempre.
export const Polarity = z.enum(['light', 'dark'])
export type Polarity = z.infer<typeof Polarity>

// Paleta derivada por fórmula (spec 0.b B). color_body es rgba (opacidad 70%).
export const PaletteTokensSchema = z.object({
  color_headline: z.string(),
  color_accent: z.string(),
  color_body: z.string(),
  bg_start: z.string(),
  bg_end: z.string(),
  color_surface: z.string(),
  color_icon: z.array(z.string()).length(4),
  // ⚠️ Las filas LEGADAS no la traen: `getLandingSession` castea sin `.parse()`, así que este
  // `.default()` NO corre al leer. Hay que defaultear en el SITIO DE USO (ver `designSystemBlock`),
  // igual que se hizo con `particles_on`. El default de intención es 'light' = el comportamiento
  // histórico, así que una sesión vieja se sigue viendo idéntica.
  polarity: Polarity.default('light'),
})
export type PaletteTokens = z.infer<typeof PaletteTokensSchema>

// ADN de la sesión (spec 0.b F): fuente única de verdad para las 8 secciones.
// `poses` mapea cada sección seleccionada a una pose única del banco (Anexo B).
export const LandingDnaSchema = z.object({
  brand_base: z.object({ hex: z.string(), h: z.number(), s: z.number(), l: z.number() }),
  palette: PaletteTokensSchema,
  particle_type: z.string(),
  particle_density: ParticleDensity,
  particles_on: z.boolean().default(true),   // el nicho activa/desactiva partículas de fondo (motor de plantillas)
  props: z.array(z.string()).min(1).max(5),
  font_family: z.string(),
  font_accent: z.string().nullable(),
  halo: Halo,
  // Dirección de arte heredada de la marca (2026-08-15): el lenguaje MATERIAL de la pieza (acabado
  // de card, relleno de icono, textura de fondo, luz, expresión tipográfica). Es lo único que
  // diferencia visualmente una landing de otra más allá del re-tinte. `.optional()` y NO
  // `.default()`: los ADN ya guardados no lo traen y `getLandingSession` castea sin `.parse()`, así
  // que el default se aplica en el SITIO DE USO (`styleOf`) — como ya pasa con `polarity`, solo que
  // acá el tipo lo dice en voz alta en vez de mentir. Sin marca → `glass_premium` = lo histórico.
  style: BrandStyle.optional(),
  model_persona: z.string(),
  // clave = SectionType slug; valor = descripción de pose. Parcial: solo las secciones elegidas.
  poses: z.record(z.string(), z.string()),
})
export type LandingDna = z.infer<typeof LandingDnaSchema>

// Puente slug interno ↔ lenguaje del spec + archivo de plantilla curada en Storage
// (bucket ad-uploads, prefijo landing-templates/, subidas por scripts/seed-landing-templates.ts;
// Task 4 — reemplaza al viejo landing-refs/ del motor DNA, ver seed-landing-templates.ts).
export const SECTION_SPEC_KEY: Record<SectionType, string> = {
  hero: 'hero_problem', beneficios: 'benefits', 'antes-despues': 'before_after',
  testimonios: 'testimonials', faq: 'faq', garantia: 'guarantee',
  oferta: 'offer', 'cta-final': 'cta_final',
}
export const SECTION_REF: Record<SectionType, string> =
  Object.fromEntries(SectionType.options.map((s) => [s, `${SECTION_SPEC_KEY[s]}.png`])) as Record<SectionType, string>

// ─── Copy por sección (gate de aprobación) ───────────────────────────────────
// Un esquema flexible cubre los 8 tipos: el LLM rellena solo los campos que aplican.
// Los `.max()` son CEILINGS con holgura de COMPLETADO, no targets de brevedad. La brevedad la
// manda el ADN (`section-dna.ts` fija el largo ideal, mucho menor). El ceiling existe solo para
// que el modelo (OpenAI aplica maxLength en decoding constreñido: si el tope llega justo, CORTA
// a mitad de palabra → "…Sient.") tenga aire para TERMINAR la frase. Español DR es ~20% más largo
// que el inglés para el que se dimensionaron antes; topes apretados = frases cortadas. Regla:
// ceiling ≈ 1.4× el target del ADN. NO recortamos post-hoc (un word-trim nunca completa una frase;
// la difusión auto-escala el texto, así que largo-y-completo > corto-y-cortado — pedido del usuario).
// ⚠️ EL MODELO REDACTA, EL CÓDIGO VERIFICA — `accentWord` tiene que ser SUB-CADENA del headline.
// `landing-system.md` lo pide ("sub-cadena EXACTA del `headline`") y `types.ts` lo documenta, pero
// nada lo comprobaba: `copyBlock` (instructions.ts) le ordena a la difusión "render the words X in
// the ACCENT COLOR **within the headline**", y cuando X no está en el headline el modelo no falla —
// lo INSERTA. Medido sobre las sesiones guardadas: 5 de 26 traen un accentWord que no aparece en su
// headline, y el caso reportado salió como titular impreso "Descansa mejor cada dormir mejor noche."
// (headline "Descansa mejor cada noche", accentWord "dormir mejor").
//
// El fail-safe es DESCARTAR el acento, no sustituirlo por otro: sin la línea de Emphasis el
// DESIGN_SYSTEM ya manda titular bicolor y el modelo elige la palabra por su cuenta — la sección
// `oferta` de esa misma sesión no traía accentWord y salió bien. Elegirle nosotros una palabra sería
// inventar copy.
//
// La comparación es insensible a mayúsculas y acentos porque el modelo reescribe el caso al citar
// ("Duerme mejor" del headline, "duerme mejor" en el campo) y ahí el acento SÍ es válido: rechazarlo
// tiraría el caso bueno. Se conserva el string original — es el que la difusión tiene que colorear.
const plano = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

//
// Y cuando SÍ está, se emite el recorte LITERAL del headline, no el string del modelo: si el campo
// dice "DESCANSO ESTA" y el titular "Tu descanso está asegurado", pedirle a la difusión que coloree
// "DESCANSO ESTA" es una versión suave del mismo bug — un string que no aparece así en el titular.
// El recorte se verifica antes de usarlo (`plano` puede no preservar índices con caracteres raros);
// si no cuadra se conserva el string del modelo, que igual está en el titular salvo caso/acentos.
/**
 * ⚠️ EL COPY VIAJA A UN MODELO DE IMAGEN, QUE DIBUJA LO QUE LEE — el marcado no es invisible, se
 * IMPRIME. Medido en la landing de snacks: `cta-final.subheadline` volvió como
 * *"Con snacks blandos de pollo,<br> ideales para perros pequeños."*, con el `<br>` dentro. En la
 * misma corrida `garantia.headline` salió *"Prueba Buddy sin preocupaciones —"*, con el conector
 * colgando: un fragmento, no un titular. Los dos son mecánicos, así que los limpia el código en vez
 * de pedírselos al prompt una cuarta vez.
 *
 * Se limpia CADA string del copy —un `<br>` es igual de visible en un bullet que en un titular— y
 * solo eso: no se reescribe nada, no se recorta nada.
 */
export function limpiarMarcado(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, ' ')       // el salto que el modelo cree que va en HTML
    .replace(/<\/?[a-z][^>]*>/gi, '')    // cualquier otra etiqueta suelta
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[\s]*[–—-]\s*$/, '')      // conector colgando al final
    .trim()
}

export function limpiarCopy<T extends Record<string, unknown>>(copy: T): T {
  const limpio = (v: unknown): unknown =>
    typeof v === 'string' ? limpiarMarcado(v)
    : Array.isArray(v) ? v.map(limpio)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpio(x)]))
    : v
  return limpio(copy) as T
}

export function cleanAccentWord<T extends { headline?: string; accentWord?: string }>(copy: T): T {
  const acc = copy.accentWord?.trim()
  if (!acc) return copy
  const headline = copy.headline ?? ''
  const i = plano(headline).indexOf(plano(acc))
  if (i < 0) {
    const { accentWord: _drop, ...rest } = copy
    return rest as T
  }
  const literal = headline.slice(i, i + acc.length)
  return plano(literal) === plano(acc) ? { ...copy, accentWord: literal } : copy
}

// ⚠️ SE LLAMA `kind` Y NO `type`, Y ES UN REQUISITO DEL TRANSPORTE, NO UN GUSTO. El validador
// de schemas del chat de KIE confunde una PROPIEDAD llamada `type` con la palabra reservada del
// JSON Schema y responde `422 …properties.type must be string or array` — medido en
// `gemini-2.5-flash` y en `gemini-3-flash`. Con el campo así, este copy no podía generarse por
// Gemini ni siquiera como fallback.
//
// Las sesiones GUARDADAS traen `type`: `getLandingSession` las normaliza al leerlas (`aKind`),
// así que no hizo falta migrar el jsonb ni tocar `LandingSection.type`, que es almacenamiento
// nuestro y nunca viaja a un modelo.
export const SectionCopySchema = z.object({
  kind: SectionType,
  headline: z.string().max(90),
  // Sub-cadena EXACTA del headline a resaltar en color de marca (ADN: 1 palabra/frase acento).
  accentWord: z.string().max(40).optional(),
  subheadline: z.string().max(120).optional(),
  // bullets: lista genérica. En `antes-despues` = columna ANTES (problemas). En otras, lista suelta.
  bullets: z.array(z.string().max(55)).max(6).optional(),
  // bulletsAfter: SOLO `antes-despues` = columna DESPUÉS (resultados). Emparejada con bullets.
  bulletsAfter: z.array(z.string().max(55)).max(6).optional(),
  // cards: testimonios ({title="Nombre, Ciudad", body=reseña}) · FAQ ({title=pregunta, body=respuesta})
  //        · beneficios ({title=beneficio, body=detalle de una línea}). Hasta 6 (FAQ llega a 5).
  cards: z.array(z.object({ title: z.string().max(60), body: z.string().max(140) })).max(6).optional(),
  // Campos del motor de plantillas (2026-07-23). Opcionales: cada sección llena los que aplican.
  kicker: z.string().max(45).optional(),        // subtítulo dorado con guiones (beneficios/antes-despues/testimonios/oferta)
  closingBold: z.string().max(55).optional(),   // beneficios: frase bold de la closing_card
  closingSub: z.string().max(120).optional(),   // beneficios: subcopy de la closing_card
  closingStrip: z.string().max(70).optional(),  // antes-despues: franja de cierre (reemplaza trust_bar)
  socialProof: z.string().max(120).optional(),  // testimonios: banda de prueba social
  ctaHeadline: z.string().max(45).optional(),   // cta-final: titular del bloque CTA (mayúsculas)
  ctaSub: z.string().max(120).optional(),       // cta-final: subcopy del bloque CTA
  cta: z.string().max(30).optional(),
})
export type SectionCopy = z.infer<typeof SectionCopySchema>

// La llamada de copy devuelve TODAS las secciones elegidas, en orden.
export const LandingCopySchema = z.object({
  sections: z.array(SectionCopySchema),
})

// ─── Copy de Oferta (motor híbrido, Fase 1) ──────────────────────────────────
// En el híbrido el texto lo compone Satori, así que la oferta deja de ser una string y
// pasa a ser datos ricos: tiers con precio ancla, ahorro, costo por unidad y decoy.
export const OfferTierSchema = z.object({
  label: z.string().max(20),                    // "3 Frascos"
  price: z.string().max(12),                    // "S/ 199"
  priceBefore: z.string().max(12).optional(),   // precio ancla → "S/ 507"
  savingsPct: z.number().int().min(1).max(90).optional(),
  perUnit: z.string().max(28).optional(),       // "S/ 0.7 por cápsula"
  badge: z.string().max(16).optional(),         // "Mejor valor"
  cta: z.string().max(18),
  featured: z.boolean(),                         // el decoy destacado
})
export type OfferTier = z.infer<typeof OfferTierSchema>

// ── Oferta a nivel de SESIÓN (Fase 5 C5.1) ──────────────────────────────────
// Los tiers (con decoy) subieron del copy de UNA sección a la SESIÓN: así el hero y el
// cta-final referencian el tier destacado sin poder contradecirlo, y validateSet tiene una
// sola fuente de precios. `.min(2)` + `.refine(1 featured)` fuerzan estructuralmente el decoy.
export const OfferSchema = z.object({
  tiers: z.array(OfferTierSchema).min(2).max(4),
  urgency: z.string().max(30).optional(),        // "Solo hoy"
}).refine((d) => d.tiers.filter((t) => t.featured).length === 1, {
  message: 'exactamente un tier debe ser featured',
})
export type Offer = z.infer<typeof OfferSchema>

// Copy PROPIO de la sección Oferta: solo su texto. Los tiers/urgency viven en OfferSchema
// (sesión); la sección los CONSUME vía resolveOffer, no los posee.
export const OfferCopySchema = z.object({
  // enum (no literal): z.toJSONSchema emite `const` para literal y Gemini lo IGNORA (solo
  // respeta `enum`) → el modelo omitía el campo y fallaba la validación. enum de un valor lo fuerza.
  // El nombre es `kind` por lo mismo que en SectionCopySchema.
  kind: z.enum(['oferta']),
  headline: z.string().max(90),
  subheadline: z.string().max(120).optional(),
})
export type OfferCopy = z.infer<typeof OfferCopySchema>

// Schema de GENERACIÓN: una sola llamada LLM produce copy + tiers; el caller lo parte en
// session.offer (tiers/urgency) y session.offer_copy (headline/subheadline). También valida el
// offer_copy LEGADO (pre-F5 guardaba los tiers acá) → resolveOffer los recupera de ahí.
export const OfferGenSchema = z.object({
  kind: z.enum(['oferta']),
  headline: z.string().max(90),
  subheadline: z.string().max(120).optional(),
  urgency: z.string().max(30).optional(),
  tiers: z.array(OfferTierSchema).min(2).max(4),
}).refine((d) => d.tiers.filter((t) => t.featured).length === 1, {
  message: 'exactamente un tier debe ser featured',
})
export type OfferGen = z.infer<typeof OfferGenSchema>

// Compat (invariante #6): sesiones pre-F5 guardaron los tiers dentro de offer_copy. Devuelve el
// Offer de la sesión, cayendo a esos tiers legados mientras `offer` siga null.
export function resolveOffer(session: Pick<LandingSessionResponse, 'offer' | 'offer_copy'>): Offer | null {
  const cur = OfferSchema.safeParse(session.offer)
  if (cur.success) return cur.data
  // `aKind`: el offer_copy legado se guardó con `type`, que es el nombre que el chat de KIE no
  // acepta. Se normaliza al leer, igual que el copy de las secciones.
  const legacy = OfferGenSchema.safeParse(aKind(session.offer_copy))
  return legacy.success ? { tiers: legacy.data.tiers, urgency: legacy.data.urgency } : null
}

// ── Bloque de CONFIANZA (Fase 5 C5.2) ───────────────────────────────────────
// Hechos OPERATIVOS del negocio: un modelo no puede inferirlos y no debe inventarlos, así que
// los llena el USUARIO en el wizard. `paymentMethods` es un enum para acotar el prompt a marcas
// reconocibles: en `oferta` el modelo DIBUJA los logos exactos de estos métodos (decisión
// 2026-07-23, ver `paymentLogosText` en instructions.ts); `garantia` deja la banda inferior
// limpia sin logos (ver `PAYMENT_BAND`). garantia/cta-final consumen este bloque directamente.
export const PaymentMethod = z.enum([
  'yape', 'plin', 'mercadopago', 'visa', 'mastercard', 'efectivo', 'transferencia',
])
export type PaymentMethod = z.infer<typeof PaymentMethod>

export const TrustBlockSchema = z.object({
  codDelivery:    z.boolean(),                                   // pago contraentrega
  deliveryTime:   z.string().max(24).optional(),                 // "24/48 horas"
  coverage:       z.array(z.string().max(20)).max(4).optional(), // ["Perú", "EE.UU."]
  paymentMethods: z.array(PaymentMethod).max(7),
  guaranteeDays:  z.number().int().min(0).max(365).optional(),
  guaranteeText:  z.string().max(60).optional(),
  freeShipping:   z.boolean().default(false),
})
export type TrustBlock = z.infer<typeof TrustBlockSchema>

/**
 * Sesiones guardadas antes del renombre traen `type` dentro del copy. Se normaliza al LEER, en un
 * solo sitio (`getLandingSession`), así el resto del código solo ve `kind` y no hizo falta migrar
 * el jsonb. Idempotente: un copy que ya tiene `kind` pasa intacto.
 */
export function aKind<T>(copy: T): T {
  if (!copy || typeof copy !== 'object') return copy
  const c = copy as Record<string, unknown>
  if ('kind' in c || !('type' in c)) return copy
  const { type, ...resto } = c
  return { ...resto, kind: type } as T
}

// Sección renderizada: copy + imagen.
export interface LandingSection {
  type: SectionType
  order: number
  copy: SectionCopy
  imageUrl: string | null
  status: 'pending' | 'done'
}

// ─── Sesión (forma de respuesta de la API) ───────────────────────────────────
export interface LandingSessionResponse {
  id: string
  created_at: string
  step: number
  product_name: string | null
  price: string | null
  benefits: string | null
  audience: string | null
  tone: string[] | null
  product_photo_urls: string[] | null
  template: string | null
  selected_sections: SectionType[] | null
  copy: SectionCopy[] | null
  sections: LandingSection[] | null
  // Ancla de producto: render limpio de la 1ª sección generada, reusado como Imagen 1 en las
  // demás secciones para que el producto salga IDÉNTICO (consistencia) con todos sus labels
  // reales (fidelidad). Se cachea una vez; null hasta que se genera la primera sección.
  product_canonical_url: string | null
  // Texto exacto de las etiquetas impresas en el producto (una línea por renglón), tipeado
  // por el usuario. Ground-truth para el prompt de imagen → el modelo renderiza las palabras
  // correctas en vez de confabular texto ilegible de la foto. Null = copiar de la foto.
  product_labels: string | null
  // Qué ES el producto en palabras del vendedor (gomitas, cápsulas, crema…). Ver la migración
  // 20260822000001: sin esto la visión deduce el formato de la etiqueta y lo inventa.
  product_form: string | null
  // Copy propio de la sección Oferta (headline/subheadline). Lo compone Satori. Null = la
  // sesión aún no generó la oferta híbrida. En sesiones pre-F5 también trae tiers/urgency. Ver OfferCopy.
  offer_copy: OfferCopy | null
  // Oferta a nivel de sesión (Fase 5): tiers de precio con decoy + urgency. Fuente única de
  // precios — la sección Oferta la consume (resolveOffer), hero/cta-final referencian el tier
  // destacado. Null en sesiones pre-F5 (los tiers siguen en offer_copy → resolveOffer los recupera).
  offer: Offer | null
  // Bloque de confianza (Fase 5): hechos operativos del negocio (contraentrega, medios de pago,
  // plazo, cobertura, garantía). Lo llena el USUARIO en el wizard, no el LLM. Ver TrustBlock.
  trust_block: TrustBlock | null
  // Origen de la placa canónica (Fase 2): 'photo' = derivada de la foto real en etapa 2;
  // 'render' (legado) o null = recortada del render de la 1ª sección. Ver product-box.ts.
  product_canonical_source: string | null
  // Placa canónica del talento (Fase 4): retrato del beneficiario generado UNA vez desde el
  // casting del talento, sobre fondo neutro. Se pasa como referencia a todas las secciones para
  // que la persona no cambie entre ellas. Null si el producto no lleva persona.
  talent_canonical_url: string | null
  // Avatares de testimonios: 3 retratos de clientes DISTINTOS, generados una vez y cacheados,
  // que la sección testimonios compone como <img> (Satori no genera caras). Null hasta generarlos.
  testimonial_avatars: string[] | null
  // Nicho y demografía confirmados por el usuario (paso 0.a). Escalares: se fijan ANTES de la
  // extracción. Null hasta que el wizard los confirma en Identidad.
  niche_id: NicheId | null
  demographic_id: DemographicId | null
  // Zona del cuerpo sobre la que actúa el producto (paso 0.a, editable en Identidad). Decide el
  // banco de poses y si hace falta una segunda placa de talento encuadrada en esa zona.
  // Null = sesión anterior a 2026-08-15 → se resuelve como `rostro` en el sitio de uso, que es el
  // comportamiento histórico (todas las poses eran de rostro).
  body_focus: BodyFocus | null
  // Placa de talento encuadrada en la ZONA, sin rostro (Fase 4 bis). Se genera junto a la
  // canónica y SOLO cuando `body_focus` no es rostro/cabello. La usan las secciones que llevan
  // protagonista MENOS el hero: el hero muestra la cara (es lo que construye confianza al abrir),
  // el resto muestra la zona donde el producto actúa. Null = el producto es de rostro, o sesión
  // legada → todas las secciones usan `talent_canonical_url` como siempre.
  talent_zone_url: string | null
  // ADN visual (paso 0.b): paleta por fórmula, partículas, props, tipografía, halo, persona y
  // poses. Fuente única para las 8 secciones. Null en sesiones legadas → el wizard re-extrae.
  landing_dna: LandingDna | null
  // Sistema de diseño de la marca, COPIADO desde la sesión de branding en el handoff (2026-08-07).
  // Se copia y no se lee al vuelo a propósito: regenerar el board de branding después mutaría en
  // silencio el sistema de una landing ya generada, y nada tendría cómo enterarse. Null = producto
  // suelto → la extracción cae a visión + nicho (decisión #7).
  brand_system: BrandSystem | null
}
