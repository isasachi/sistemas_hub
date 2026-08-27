/**
 * ¿EL PROMPT NUEVO DEJA DE REPINTAR LO QUE LA PLANTILLA YA FIJA?
 * ---------------------------------------------------------------------------
 * Renderiza secciones REALES de una sesión guardada con el builder actual, para comparar
 * contra las imágenes que esa misma sesión produjo con el prompt viejo. Verifica tres cosas
 * a la vez, que es lo que se cambió el 2026-08-27:
 *
 *   1. la banda de confianza sale igual entre secciones (ya no la repinta el texto),
 *   2. el borde/acabado de la card sale igual entre secciones (lo manda la plantilla),
 *   3. no se imprime ninguna DIRECCIÓN como copy (el casting de testimonios, el
 *      `NO_SALES_BLOCK` de beneficios).
 *
 * ⚠️ **NO ESCRIBE EN LA BASE**, a propósito: regenerar por la ruta real sobrescribiría las
 * secciones del usuario, y entonces no quedaría con qué comparar. Solo baja insumos y
 * escribe PNGs a disco.
 *
 * ⚠️ Gasta UNA generación de imagen por sección pedida (gpt-image-2, la paga el hub). No
 * toca la cuota per-step porque no pasa por `checkGenQuota`.
 *
 *   npx tsx --env-file=.env.local scripts/probe-landing-estandar.ts <sessionId> <sec> [sec...]
 */
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'
import type { Part } from '@google/genai'
import { fetchAsBase64, storagePublicUrl } from '../lib/storage'
import { generateImage } from '../lib/gemini'
import { buildDiffusionInstruction, MULTI_UNIT_SECTIONS, NO_TALENT_SECTIONS } from '../lib/landing/instructions'
import { buildProductPack } from '../lib/landing/product-box'
import { NO_TALENT_SUBSTITUTE, DEMOGRAPHIC_LABELS, zoneNeedsOwnPlate } from '../lib/landing/demographics'
import { SectionCopySchema, SECTION_REF, resolveOffer, SectionType } from '../lib/landing/types'

const SALIDA = process.env.PROBE_OUT ?? '/home/isasachi/.claude/jobs/e42ca7ab/tmp/std'
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const [id, ...secciones] = process.argv.slice(2)
  if (!id || !secciones.length) throw new Error('Uso: probe-landing-estandar.ts <sessionId> <seccion...>')

  const { data } = await db.from('landing_sessions').select('*').eq('id', id).single()
  const s = data as Record<string, any>
  if (!s) throw new Error('No existe la sesión')
  const offer = resolveOffer(s.offer)

  for (const raw of secciones) {
    const tipo = SectionType.parse(raw)
    const aprobado = (s.copy ?? []).find((c: any) => c.kind === tipo)
    if (!aprobado) { console.log(`· ${tipo}: sin copy aprobado, se salta`); continue }
    const copy = SectionCopySchema.parse(aprobado)

    // Mismo contrato de orden que la ruta: producto (o pack) → fotos → talento → PLANTILLA.
    const parts: Part[] = []
    let packUnits: number | null = null
    if (s.product_canonical_url) {
      const anchor = await fetchAsBase64(s.product_canonical_url)
      if (MULTI_UNIT_SECTIONS.has(tipo)) {
        const pack = await buildProductPack(Buffer.from(anchor.data, 'base64'), 3)
        parts.push({ inlineData: { mimeType: 'image/png', data: pack.toString('base64') } })
        packUnits = 3
      } else {
        parts.push({ inlineData: { mimeType: anchor.mimeType, data: anchor.data } })
      }
    }
    for (const url of (s.product_photo_urls ?? []) as string[]) {
      const { data: d, mimeType } = await fetchAsBase64(url)
      parts.push({ inlineData: { mimeType, data: d } })
    }
    const hasTalent = s.demographic_id !== 'no_talent' && !!s.talent_canonical_url
    const showProtagonist = hasTalent && !NO_TALENT_SECTIONS.has(tipo)
    const usaZona = showProtagonist && tipo !== 'hero'
      && !!s.talent_zone_url && zoneNeedsOwnPlate(s.body_focus)
    if (showProtagonist) {
      const plate = await fetchAsBase64(usaZona ? s.talent_zone_url : s.talent_canonical_url)
      parts.push({ inlineData: { mimeType: plate.mimeType, data: plate.data } })
    }
    const ref = await fetchAsBase64(storagePublicUrl(`landing-templates/${SECTION_REF[tipo]}`))
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } })

    const prompt = buildDiffusionInstruction({
      section: tipo, copy, dna: s.landing_dna,
      productLabels: s.product_labels ?? null, productForm: s.product_form ?? null,
      offer, trust: s.trust ?? null, packUnits,
      hasTalent, nicheId: s.niche_id ?? null,
      talentSubstitute: !hasTalent ? (s.niche_id ? NO_TALENT_SUBSTITUTE[s.niche_id as keyof typeof NO_TALENT_SUBSTITUTE] : 'Producto en contexto') : undefined,
      demographicLabel: s.demographic_id ? DEMOGRAPHIC_LABELS[s.demographic_id as keyof typeof DEMOGRAPHIC_LABELS] : undefined,
      bodyFocus: s.body_focus ?? undefined,
      zonePlate: usaZona,
    })
    parts.push({ text: prompt })

    console.log(`· ${tipo}: prompt ${prompt.length} caracteres, ${parts.length - 1} imágenes`)
    const b64 = await generateImage(parts, 3, { aspectRatio: '9:16' })
    const ruta = `${SALIDA}-${tipo}.png`
    await writeFile(ruta, Buffer.from(b64, 'base64'))
    console.log(`  → ${ruta}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
