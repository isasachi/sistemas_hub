import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { callStructured } from '@/lib/gemini'
import { LandingCopySchema, OfferGenSchema, SectionCopySchema, SECTION_LABELS, cleanAccentWord, limpiarCopy, type SectionCopy, type SectionType, type Offer, type OfferCopy, type LandingSessionResponse } from './types'
import { SECTION_DNA } from './section-dna'
import type { Part } from '@google/genai'

// Generación de copy compartida entre la ruta /copy (regenera con feedback) y el
// handoff from-branding (genera el copy inicial). Una llamada estructurada barata.

const LANDING_SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/landing-system.md'),
  'utf-8'
)

// Los bullets de hero/beneficios/cta-final deben coincidir (decisión #3). Toma el primer array
// no vacío entre hero→beneficios como canónico (4), lo pone en hero y cta-final; beneficios
// conserva su 5.º si lo tiene. $0, sin columna DB — se distribuye en generación.
export function shareBullets(sections: SectionCopy[]): SectionCopy[] {
  const source = sections.find((s) => s.kind === 'hero')?.bullets
    ?? sections.find((s) => s.kind === 'beneficios')?.bullets
  if (!source?.length) return sections
  const canon = source.slice(0, 4)
  return sections.map((s) => {
    if (s.kind === 'hero' || s.kind === 'cta-final') return { ...s, bullets: canon }
    if (s.kind === 'beneficios') return { ...s, bullets: [...canon, ...(s.bullets ?? []).slice(4)] }
    return s
  })
}

// Checklist de arrays obligatorios (conteo exacto), derivado del ADN — el modelo tiende a omitir
// bullets/cards; nombrarlos explícito y con conteo reduce el fallo (y `missingStructure` lo valida).
function requiredArraysChecklist(sections: SectionType[]): string {
  const rows = sections.map((s) => {
    const r = SECTION_DNA[s].requires
    if (!r) return null
    const bits = [r.bullets && `${r.bullets} bullets`, r.bulletsAfter && `${r.bulletsAfter} bulletsAfter`, r.cards && `${r.cards} cards`, ...(r.fields ?? [])].filter(Boolean)
    return bits.length ? `  - ${s}: ${bits.join(' + ')}` : null
  }).filter(Boolean)
  return rows.length
    ? `CAMPOS ARRAY OBLIGATORIOS (conteo EXACTO, NUNCA los omitas ni los dejes vacíos):\n${rows.join('\n')}`
    : ''
}

// Falta de estructura vs el ADN (post-shareBullets): devuelve un mensaje por cada array corto. Puro.
export function missingStructure(sections: SectionType[], copy: SectionCopy[]): string[] {
  const gaps: string[] = []
  for (const s of sections) {
    const req = SECTION_DNA[s].requires
    if (!req) continue
    const c = copy.find((x) => x.kind === s)
    if (!c) { gaps.push(`Falta la sección "${s}" completa.`); continue }
    const short = (have: number, need: number, field: string) => { if (have < need) gaps.push(`"${s}" necesita ${need} ${field} (tiene ${have}).`) }
    if (req.bullets !== undefined) short(c.bullets?.length ?? 0, req.bullets, 'bullets')
    if (req.bulletsAfter !== undefined) short(c.bulletsAfter?.length ?? 0, req.bulletsAfter, 'bulletsAfter')
    if (req.cards !== undefined) short(c.cards?.length ?? 0, req.cards, 'cards')
    for (const f of req.fields ?? [])
      if (!(c as unknown as Record<string, unknown>)[f]) gaps.push(`"${s}" necesita el campo "${f}", que la composición dibuja.`)
  }
  return gaps
}

function copyPromptParts(session: LandingSessionResponse, sections: SectionType[], feedback?: string): Part[] {
  return [
    {
      text: [
        `Escribe el copy de una landing page para este producto. Devuelve JSON (esquema LandingCopy).`,
        ``,
        `Producto: ${session.product_name ?? 'no especificado'}`,
        `Precio / oferta: ${session.price || 'no especificado'}`,
        `Beneficios clave: ${session.benefits || 'no especificados'}`,
        `Público objetivo: ${session.audience || 'no especificado'}`,
        `Tono deseado: ${(session.tone ?? []).join(', ') || 'no especificado'}`,
        `Nicho: ${session.niche_id ?? 'genérico'}`,
        `Demografía objetivo: ${session.demographic_id ?? 'no especificada'}`,
        `IMPORTANTE — los nombres y perfiles de los testimonios deben ser COHERENTES con la demografía objetivo (mismo género y rango de edad). No mezcles géneros si la demografía es de un solo género.`,
        feedback?.trim() ? `\nAjustes pedidos por el usuario: ${feedback.trim()}` : '',
        ``,
        `Secciones a escribir (en este orden). Para CADA sección respeta EXACTAMENTE la ESTRUCTURA de su ADN de copy (conteos de bullets/cards, campos, patrón) — es la fuente de verdad y NO se toca; lo único que adaptás al producto/nicho es el WORDING:`,
        ...sections.map((s, i) => `  ${i + 1}. type="${s}" — ${SECTION_LABELS[s]}\n     ESTRUCTURA (obligatoria): ${SECTION_DNA[s].copy}`),
        ``,
        requiredArraysChecklist(sections),
        ``,
        `Una entrada por sección, con su "type" correcto. La estructura manda; el wording varía por nicho/producto.`,
      ].filter(Boolean).join('\n'),
    },
  ]
}

// Schema POR SECCIÓN: hace REQUERIDOS los arrays del ADN con `.min(conteo)`. Ataca la causa raíz de
// que Gemini omita bullets/cards (su responseSchema los tenía opcionales → los saltaba); a OpenAI lo
// refuerza (el strict ya los requería, ahora también fuerza el conteo vía minItems). Las secciones
// sin `requires` (oferta) usan el schema base. El card shape replica el de SectionCopySchema.
export function sectionCopySchema(s: SectionType) {
  const req = SECTION_DNA[s].requires
  if (!req) return SectionCopySchema
  // `.length(n)` = minItems=maxItems=n → conteo EXACTO (las plantillas tienen slots fijos: no sirve
  // un rango). Fuerza contra la sub-producción de Gemini Y la sobre-producción de OpenAI.
  // Los .max() son CEILINGS con holgura de completado — DEBEN coincidir con SectionCopySchema
  // (types.ts): un tope más bajo acá re-introduciría el corte a mitad de frase que ya arreglamos.
  const ext: Record<string, z.ZodTypeAny> = {}
  if (req.bullets) ext.bullets = z.array(z.string().max(55)).length(req.bullets)
  if (req.bulletsAfter) ext.bulletsAfter = z.array(z.string().max(55)).length(req.bulletsAfter)
  if (req.cards) ext.cards = z.array(z.object({ title: z.string().max(60), body: z.string().max(140) })).length(req.cards)
  return SectionCopySchema.extend(ext)
}

// Genera el copy de UNA sección (per-sección enfocado > batch-8, que hacía omitir arrays densos).
// 1º con el schema por-sección de arrays requeridos (fuerza presencia+conteo en ambos motores); si el
// modelo no lo cumple tras los reintentos internos, best-effort con el schema laxo (evita 500 — el
// retry correctivo de generateLandingCopy es la red final).
async function generateOneSection(session: LandingSessionResponse, s: SectionType, feedback?: string): Promise<SectionCopy | null> {
  // Prefiere la sección con el type correcto; si el modelo devolvió UNA sola con el type mal escrito,
  // la coacciona a `s` (per-sección pedimos exactamente `s`, así que esa única ES `s`); si no, null —
  // nunca guarda un objeto de OTRO type bajo la clave `s` (corrompería shareBullets/render por type).
  const pick = (r: { sections: SectionCopy[] }): SectionCopy | null => {
    const hit = r.sections.find((x) => x.kind === s) ?? (r.sections.length === 1 ? { ...r.sections[0], kind: s } : null)
    return hit && cleanAccentWord(limpiarCopy(hit))
  }
  const parts = copyPromptParts(session, [s], feedback)
  try {
    const strict = z.object({ sections: z.array(sectionCopySchema(s)) })
    return pick(await callStructured('landing_copy', strict, parts, 3, LANDING_SYSTEM_PROMPT) as { sections: SectionCopy[] })
  } catch {
    return pick(await callStructured('landing_copy', LandingCopySchema, parts, 2, LANDING_SYSTEM_PROMPT))
  }
}

// (Se eliminó `trimCopyStrings`.) Antes recortaba al límite de palabra los strings pegados al tope,
// pero un word-trim NUNCA completa una frase: solo maquillaba el corte a mitad de palabra que causaba
// el propio `.max()` apretado (OpenAI aplica maxLength en decoding → corta la frase justo en el tope).
// El fix real fue subir los ceilings de SectionCopySchema (holgura de completado) para que el modelo
// TERMINE la frase; sin corte que limpiar, el post-trim sobra. La difusión auto-escala el texto, así
// que largo-y-completo > corto-y-cortado (pedido del usuario). El ADN sigue empujando la brevedad.
export async function generateLandingCopy(
  session: LandingSessionResponse,
  sections: SectionType[],
  feedback?: string
): Promise<SectionCopy[]> {
  // Per-sección en paralelo (más fiable que batch-8 para llenar bullets/cards).
  const bySection = new Map<SectionType, SectionCopy>()
  const first = await Promise.all(sections.map((s) => generateOneSection(session, s, feedback)))
  sections.forEach((s, i) => { if (first[i]) bySection.set(s, first[i]!) })

  let out = shareBullets([...bySection.values()])
  // Retry correctivo de las secciones que siguen cortas tras shareBullets (cta-final se llena con los
  // bullets del hero, así que ya no aparece corta). El strict schema de OpenAI fuerza la PRESENCIA del
  // array pero no el CONTEO — algunas secciones (testimonios) sub-producen 1; se nombran los faltantes
  // y se insiste hasta 2 rondas (la generación es estocástica). El mensaje ordena INVENTAR de muestra
  // antes que devolver menos (es contenido de plantilla que el usuario editará).
  for (let attempt = 0; attempt < 2; attempt++) {
    // "Corta" = falta la sección entera (generateOneSection devolvió null — incluye oferta y demás sin
    // `requires`, que missingStructure no chequea) O le faltan arrays del ADN.
    const shortSections = sections.filter((s) => !out.some((c) => c.kind === s) || missingStructure([s], out.filter((c) => c.kind === s)).length > 0)
    if (!shortSections.length) break
    await Promise.all(shortSections.map(async (s) => {
      const gaps = missingStructure([s], out.filter((c) => c.kind === s))
      // Con gaps de arrays → mensaje correctivo. Sin gaps (sección faltó entera, ej fallo transitorio
      // de una sin `requires`) → simple re-generación con el feedback original.
      const fb = gaps.length
        ? `${feedback?.trim() ? feedback.trim() + '\n' : ''}CORRIGE la estructura (OBLIGATORIO): ${gaps.join(' ')} Devuelve la sección "${s}" con su array del tamaño EXACTO indicado. Si te faltan ideas, INVENTA entradas realistas de muestra (es contenido de plantilla que el vendedor editará) — NUNCA devuelvas menos del conteo pedido.`
        : feedback
      const fixed = await generateOneSection(session, s, fb)
      if (fixed) bySection.set(s, fixed)
    }))
    out = shareBullets([...bySection.values()])
  }
  return out
}

// Copy de la Oferta HÍBRIDA. Una call estructurada produce copy + tiers (OfferGenSchema fuerza
// el decoy: ≥2 tiers, exactamente uno featured); el resultado se PARTE en `offer` (tiers/urgency,
// nivel de sesión — Fase 5 C5.1) y `copy` (headline/subheadline, propio de la sección). El
// `.refine` se valida post-hoc en callStructured → reintenta si el modelo no cumple.
// El % de ahorro se CALCULA de los precios (no lo escribe el LLM, que se equivoca y a veces omite
// el mayor descuento en el tier destacado). Sin ancla válida → sin %.
function parsePrice(s?: string): number | null {
  const m = s?.replace(/\s/g, '').match(/(\d[\d.,]*)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
function recomputeSavings(offer: Offer): Offer {
  return {
    ...offer,
    tiers: offer.tiers.map((t) => {
      const now = parsePrice(t.price), before = parsePrice(t.priceBefore)
      const pct = now && before && before > now ? Math.round((1 - now / before) * 100) : undefined
      return { ...t, savingsPct: pct }
    }),
  }
}

// ⚠️ EL MODELO REDACTA, EL CÓDIGO VERIFICA — el precio del usuario es un DATO, no una sugerencia.
// El prompt lo pide (y medido contra la API real lo cumple: "S/ 89" → tier de 1 unidad "S/ 89"),
// pero nada lo comprobaba y el fallo es caro: una landing que anuncia una cifra que el vendedor no
// cobra. Se acota al caso INEQUÍVOCO — el input trae UN solo número ("119", "S/ 89"). Con cero no
// hay nada que fijar; con varios ("1xS/89 2xS/169 3xS/199", "S/89 · Envío gratis · 2x1") el orden
// es ambiguo y adivinarlo es peor que el prompt, que sí lee la estructura 1x/2x/3x.
//
// ⚠️ SE ESCALA LA ESCALERA ENTERA, NO SE PISA UN TIER SUELTO. Pisar solo el barato deja
// "1x S/ 89 · 2x S/ 350 · 3x S/ 450": el volumen pasa a ser un CASTIGO y los perUnit de los otros
// tiers siguen con la aritmética vieja — una card visiblemente rota, peor que el precio inventado
// que reemplaza, y que `validateSet` no ve (todos esos precios SÍ existen en los tiers). Con un
// factor único todo queda coherente sin leer la cantidad de ningún label: los descuentos por
// volumen, las anclas y los % de ahorro son proporciones, y una proporción sobrevive la escala.
function scalePrice(s: string | undefined, ratio: number): string | undefined {
  return s?.replace(/\d[\d.,]*/, (m) => {
    const v = parseFloat(m.replace(/,/g, '')) * ratio
    if (!Number.isFinite(v)) return m
    return v >= 10 ? String(Math.round(v)) : v.toFixed(2).replace(/\.?0+$/, '')
  })
}

// Cantidad declarada en el label ("2 Unidades", "3 Frascos"). El label lo escribe el modelo y es
// texto libre, así que sin número devuelve null y el perUnit se deja como estaba.
function tierQty(label?: string): number | null {
  const m = label?.match(/\d+/)
  const n = m ? parseInt(m[0], 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

// ⚠️ EL PRECIO DEL USUARIO SE ESCRIBE EXACTO, NO ESCALADO — un centavo se perdía justo en la
// función que existe para no perderlo. `scalePrice` redondea a entero todo lo que pase de 10, así
// que con el usuario pidiendo "S/ 89.90" sobre una oferta de S/ 89 el ratio daba 89.9 y la card
// salía diciendo **S/ 90**. Es el fallo que `pinUserPrice` vino a evitar, de nuevo y por 10
// céntimos: una landing que anuncia una cifra que el vendedor no cobra. El resto de la escalera SÍ
// se escala y se redondea (los precios en soles son enteros); lo que se fija literal es el tier que
// el usuario nombró.
const fmtSoles = (v: number): string => {
  const r = Math.round(v * 100) / 100
  return Number.isInteger(r) ? String(r) : r.toFixed(2)
}

export function pinUserPrice(offer: Offer, userPrice?: string | null): Offer {
  const nums = userPrice?.match(/\d[\d.,]*/g) ?? []
  if (nums.length !== 1) return offer
  const want = parsePrice(nums[0])
  if (!want) return offer
  if (offer.tiers.some((t) => parsePrice(t.price) === want)) return offer
  // El tier más barato es el de 1 unidad, que es al que apunta un precio suelto.
  const base = Math.min(...offer.tiers.map((t) => parsePrice(t.price) ?? Infinity))
  if (!Number.isFinite(base) || base <= 0) return offer
  const ratio = want / base
  const tiers = offer.tiers.map((t) => {
    const esElDelUsuario = parsePrice(t.price) === base
    // El tier que el usuario nombró lleva SU cifra, con sus decimales; los demás, la escala.
    const price = esElDelUsuario
      ? (t.price.replace(/\d[\d.,]*/, fmtSoles(want)))
      : (scalePrice(t.price, ratio) ?? t.price)
    const priceBefore = scalePrice(t.priceBefore, ratio)
    // Un ancla que no quedó por encima del precio es una card rota (recomputeSavings solo limpia
    // el %, no el ancla). Solo puede pasar si el modelo ya la había dado mal: la escala es uniforme.
    const validBefore = (parsePrice(priceBefore) ?? 0) > (parsePrice(price) ?? 0)
    // ⚠️ EL perUnit SE DERIVA DEL PRECIO, NO SE ESCALA APARTE. `scalePrice` redondea cada campo por
    // su cuenta, así que precio y precio-por-unidad quedaban contando historias distintas: medido
    // con base S/ 129, el tier de 3 salía "S/ 317" con "S/ 106 c/u" — y 106 × 3 = 318. La card no
    // cierra, y es la clase de error que un comprador SÍ hace a mano. Derivarlo del precio ya
    // fijado lo vuelve consistente por construcción.
    // Solo se reescribe el formato "c/u" que pide el prompt: un perUnit como "S/ 0.7 por cápsula"
    // NO es precio-por-pack (la cantidad del label no es el número de cápsulas), así que ese se
    // escala como antes.
    const q = tierQty(t.label)
    const precioNum = parsePrice(price)
    const perUnit = t.perUnit && /c\/u/i.test(t.perUnit) && q && precioNum
      ? t.perUnit.replace(/\d[\d.,]*/, fmtSoles(precioNum / q))
      : scalePrice(t.perUnit, ratio)
    return { ...t, price, priceBefore: validBefore ? priceBefore : undefined, perUnit }
  })
  // Los strings los genera este código, así que los topes del schema (price 12, perUnit 28) no los
  // valida nadie más: si la escala se pasa de largo, se deja lo del modelo antes que romper el parse.
  if (tiers.some((t) => t.price.length > 12 || (t.perUnit?.length ?? 0) > 28 || (t.priceBefore?.length ?? 0) > 12)) return offer
  console.warn(`[landing-offer] el modelo ignoró el precio del usuario (${userPrice}); se reescala la oferta a S/ ${want}`)
  return { ...offer, tiers }
}

export async function generateOfferCopy(
  session: LandingSessionResponse,
  feedback?: string,
): Promise<{ offer: Offer; copy: OfferCopy }> {
  const parts: Part[] = [
    {
      text: [
        `Escribe SOLO el copy de la sección OFERTA de una landing (esquema OfferCopy).`,
        `El campo "type" debe ser exactamente "oferta".`,
        ``,
        `Producto: ${session.product_name ?? 'no especificado'}`,
        `Precio / oferta: ${session.price || 'no especificado'}`,
        `Beneficios clave: ${session.benefits || 'no especificados'}`,
        `Público objetivo: ${session.audience || 'no especificado'}`,
        `Tono deseado: ${(session.tone ?? []).join(', ') || 'no especificado'}`,
        feedback?.trim() ? `\nAjustes pedidos por el usuario: ${feedback.trim()}` : '',
        ``,
        `Reglas de la oferta:`,
        `- EL PRECIO DEL USUARIO ES LA FUENTE DE VERDAD. Si arriba hay un precio, el tier de 1 unidad`,
        `  DEBE costar EXACTAMENTE esa cifra, y los demás tiers se derivan de ella (2 y 3 unidades con`,
        `  descuento por volumen). Si el usuario ya dio precios por cantidad, cópialos tal cual. Solo`,
        `  cuando no haya ningún precio inventás uno plausible para el producto y el mercado peruano.`,
        `- Preferentemente 3 tiers de cantidad (1 / 2 / 3 unidades). Precios en soles, con el símbolo "S/" delante.`,
        `- Exactamente UN tier con featured:true — el mediano-alto (el decoy que querés vender).`,
        `- TODOS los tiers llevan priceBefore (precio ancla tachado), savingsPct y perUnit —`,
        `  las cards deben verse pobladas. perUnit = costo por unidad, con el formato "S/ N c/u".`,
        `- badge corto solo en el featured ("Mejor valor" / "Recomendado").`,
        `- urgency solo si aplica ("Solo hoy", "Stock limitado"). cta corto por tier ("Compra ya").`,
      ].join('\n'),
    },
  ]
  const gen = await callStructured('landing_offer_copy', OfferGenSchema, parts, 3, LANDING_SYSTEM_PROMPT)
  return {
    offer: recomputeSavings(pinUserPrice({ tiers: gen.tiers, urgency: gen.urgency }, session.price)),
    copy: { kind: 'oferta', headline: gen.headline, subheadline: gen.subheadline },
  }
}
