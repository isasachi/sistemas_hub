// Probe del eje de talento contextual: ¿la visión decide la COMPLEXIÓN y las POSES a partir de la
// PROMESA del producto, o devuelve el avatar de catálogo de siempre? Corre `extractDna` real sobre
// dos sesiones de producción que contrastan justo en eso (un producto para dormir sin zona, y una
// creatina de glúteos con zona). Es UNA llamada de visión por caso, no genera ninguna imagen y no
// toca cuota de imagen. Se corre a mano desde la raíz del repo:
//   npx tsx --env-file=.env.local apps/web/scripts/probe-talento-contextual.ts
import { extractDna } from '../lib/landing/extract-dna'
import { classifyNiche } from '../lib/landing/classify'
import { NICHE_LABELS } from '../lib/landing/niches'
import { BODY_FOCUS_LABELS } from '../lib/landing/demographics'
import type { LandingSessionResponse, SectionType, NicheId, DemographicId, BodyFocus } from '../lib/landing/types'

const ORDEN: SectionType[] = ['hero', 'oferta', 'antes-despues', 'beneficios']

const CASOS = [
  {
    nombre: 'GomiSleep — cápsulas de magnesio para dormir (SIN zona)',
    niche: 'supplement_skin_female' as NicheId,
    demographic: 'female_30_45' as DemographicId,
    focus: 'cuerpo_completo' as BodyFocus,
    benefits: 'Cápsulas de magnesio para dormir mejor',
    audience: 'Mujeres de 25 a 40, Hombres de 25 a 45',
    foto: 'https://hryygojgihqazsmnduvh.supabase.co/storage/v1/object/public/ad-uploads/eb81cffb-3ed6-46d4-aa11-36a1cda5b0d3/mockup.png?v=1786051288690',
  },
  {
    nombre: 'CreatiMax — creatina para glúteos (zona gluteos_piernas)',
    niche: 'fitness_weightloss' as NicheId,
    demographic: 'female_18_30' as DemographicId,
    focus: 'gluteos_piernas' as BodyFocus,
    benefits: 'Creatina en polvo para fortalecimiento de gluteos',
    audience: 'Mujeres de 25 a 40, Deportistas',
    foto: 'https://hryygojgihqazsmnduvh.supabase.co/storage/v1/object/public/ad-uploads/9a8d80c2-01e3-4ad9-aa5a-c817efa67391/mockup.png?v=1786831887794',
  },
  {
    nombre: 'NNF Gummy-Sleep — gomitas de melatonina, nicho "suplemento masculino" (caso reportado)',
    niche: 'supplement_male_performance' as NicheId,
    demographic: 'male_20_35' as DemographicId,
    focus: 'torso' as BodyFocus,
    benefits: 'Gomitas de melatonina para dormir profundo y despertar renovado',
    audience: 'Hombres de 25 a 45',
    foto: 'https://hryygojgihqazsmnduvh.supabase.co/storage/v1/object/public/ad-uploads/33beb825-d25c-4e7f-878a-efb6a9675073/photo-0.jpg?v=1787356592969',
  },
]

function sesion(c: (typeof CASOS)[number]): LandingSessionResponse {
  return {
    id: 'probe', created_at: '', step: 0,
    product_name: c.nombre, price: null,
    benefits: c.benefits, audience: c.audience, tone: null,
    product_photo_urls: [c.foto],
  } as unknown as LandingSessionResponse
}

async function main() {
  for (const c of CASOS) {
    console.log('\n' + '='.repeat(78))
    console.log(c.nombre)
    console.log('='.repeat(78))
    // ¿A qué nicho y zona manda hoy el clasificador este mismo producto?
    const cls = await classifyNiche(sesion(c))
    console.log(`\nCLASIFICA COMO: ${NICHE_LABELS[cls.niche_id]} · zona: ${BODY_FOCUS_LABELS[cls.body_focus]}`)
    const dna = await extractDna(sesion(c), c.niche, c.demographic, ORDEN, c.focus)
    console.log('\nPERSONA:\n  ' + dna.model_persona)
    console.log('\nPOSES:')
    for (const s of ORDEN) console.log(`  [${s}]\n    ${dna.poses[s]}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
