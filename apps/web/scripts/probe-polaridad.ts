/**
 * ¿Por qué la MISMA foto de producto sale clara en una sesión y oscura en la siguiente?
 *
 * El dueño del repo hizo tres sesiones con el mismo frasco blanco de NNF Gummy Sleep y la tercera
 * salió en modo oscuro. `polarity` es un campo que decide la VISIÓN, y de él cuelga toda la paleta
 * (`derivePalette`). La hipótesis ingenua —ruido de muestreo— no se sostiene sola: las tres
 * sesiones mandaron CONTEXTOS distintos en el mismo prompt (nicho, público, zona, promesa), así
 * que hay que separar las dos causas antes de arreglar nada.
 *
 * DISEÑO: una sola foto, dos contextos reales, N corridas cada uno.
 *   - Si un contexto sale oscuro de forma consistente y el otro claro → lo contamina el CONTEXTO.
 *   - Si los dos alternan → es varianza del modelo.
 *
 * Solo texto + 1 imagen por llamada: cero cuota de imagen.
 *
 *   npx tsx --env-file=.env.local scripts/probe-polaridad.ts
 */
import { z } from 'zod'
import type { Part } from '@google/genai'
import { callStructured } from '../lib/gemini'
import { fetchAsBase64 } from '../lib/storage'
import { hexToHsl } from '../lib/landing/palette-derive'
import { extractDna } from '../lib/landing/extract-dna'
import type { LandingSessionResponse, SectionType, NicheId, DemographicId, BodyFocus } from '../lib/landing/types'

const FOTO =
  'https://hryygojgihqazsmnduvh.supabase.co/storage/v1/object/public/ad-uploads/e3117b54-aa09-46a8-9424-5edf17ad8795/photo-0.jpg?v=1787358305026'

const CORRIDAS = 3

// El prompt de producción, recortado a lo que decide la polaridad (y al campo nuevo que se
// propone medir). Lo demás del prompt real no interviene en este eje.
const PROMPT_ACTUAL = [
  'Analiza el envase del producto, no el fondo de la foto.',
  '',
  'Decide si el producto se lee OSCURO o CLARO (polarity): `dark` si su envase y su etiqueta',
  'son de tonos oscuros y el texto impreso encima va claro (frasco negro mate, ámbar oscuro, lata',
  'negra); `light` si el envase y la etiqueta son claros con texto oscuro encima. Juzgá el ENVASE,',
  'nunca el fondo de la foto ni la iluminación del estudio: un frasco negro fotografiado sobre fondo',
  'blanco es `dark`.',
].join('\n')

// La propuesta: en vez de pedir el VEREDICTO, pedir el HECHO y decidir en código.
const PROMPT_MEDIDO = [
  'Analiza el envase del producto, no el fondo de la foto.',
  '',
  'Devuelve `package_hex`: el color de la SUPERFICIE MAYORITARIA del envase — el cuerpo del',
  'frasco, la lata o el pomo, el material que ocupa más área. A diferencia del color de marca, acá',
  'SÍ cuentan los blancos, los negros, los grises y los plateados: si el frasco es blanco, el valor',
  'es un blanco. No devuelvas el color del fondo de la foto, ni el de la superficie donde se apoya,',
  'ni el de un reflejo o un brillo especular. Si el envase es transparente, devolvé el color de su',
  'contenido. Formato #RRGGBB.',
].join('\n')

const SchemaActual = z.object({ polarity: z.enum(['light', 'dark']) })
const SchemaMedido = z.object({ package_hex: z.string() })

// Contextos REALES de dos de las tres sesiones, tal como los arma `runVision`.
const CONTEXTOS: Record<string, string> = {
  'A · e3117b54 (salió OSCURA)': [
    'Nicho: supplement_female',
    'Qué promete: Ayuda a conciliar el sueño, mejora el descanso nocturno, reduce el estrés',
    'Público: Mujeres de 18 a 30 años',
    'Persona ya decidida (no la cambies): Mujer peruana de 18-30',
    'Zona del cuerpo sobre la que actúa: Sin zona específica',
  ].join('\n'),
  'B · f2ad4351 (salió CLARA)': [
    'Nicho: supplement_male_performance',
    'Qué promete: Ayuda a conciliar el sueño, mejora el descanso nocturno, reduce el estrés',
    'Público: Hombres de 20 a 35 años',
    'Persona ya decidida (no la cambies): Hombre peruano de 20-35',
    'Zona del cuerpo sobre la que actúa: Sin zona específica',
  ].join('\n'),
}

// El camino REAL: `extractDna` con el PROMPT de producción entero (color + partículas + props +
// talento), que es donde la polaridad convive con el razonamiento sobre la promesa. Un prompt
// recortado a la pregunta de polaridad no reproduce el fallo — hay que correr el de verdad.
const ORDEN: SectionType[] = ['hero', 'oferta', 'beneficios', 'antes-despues', 'testimonios', 'faq', 'garantia', 'cta-final']

const SESIONES: { nombre: string; niche: NicheId; demo: DemographicId; focus: BodyFocus; benefits: string; audience: string }[] = [
  {
    nombre: 'A · e3117b54 (salió OSCURA)',
    niche: 'supplement_female',
    demo: 'female_18_30',
    focus: 'cuerpo_completo',
    benefits: 'Ayuda a conciliar el sueño, mejora el descanso nocturno, reduce el estrés',
    audience: 'Mujeres de 18 a 30 años',
  },
  {
    nombre: 'B · f2ad4351 (salió CLARA)',
    niche: 'supplement_male_performance',
    demo: 'male_20_35',
    focus: 'cuerpo_completo',
    benefits: 'Ayuda a conciliar el sueño, mejora el descanso nocturno, reduce el estrés',
    audience: 'Hombres de 20 a 35 años',
  },
]

async function main() {
  const { data, mimeType } = await fetchAsBase64(FOTO)
  const img: Part = { inlineData: { mimeType, data } }

  console.log('--- 1. CAMINO REAL (extractDna, prompt de producción completo) ---')
  console.log('    (con `package_hex` medido en código; antes se le preguntaba el veredicto al modelo)')
  for (const s of SESIONES) {
    const sesion = {
      product_photo_urls: [FOTO],
      product_labels: null,
      product_form: null,
      benefits: s.benefits,
      audience: s.audience,
      brand_system: null,
    } as unknown as LandingSessionResponse
    const salidas: string[] = []
    for (let i = 0; i < CORRIDAS; i++) {
      const dna = await extractDna(sesion, s.niche, s.demo, ORDEN, s.focus)
      salidas.push(`${dna.palette.polarity} (${dna.palette.bg_start})`)
    }
    console.log(`  ${s.nombre}: ${salidas.join(' · ')}`)
  }

  console.log('\n--- 2. LA PREGUNTA AISLADA: juzgar vs medir ---')
  for (const [nombre, ctx] of Object.entries(CONTEXTOS)) {
    const veredictos: string[] = []
    const medidos: string[] = []
    for (let i = 0; i < CORRIDAS; i++) {
      const a = await callStructured('probe_polarity_actual', SchemaActual, [img, { text: `${PROMPT_ACTUAL}\n\n${ctx}` }])
      veredictos.push(a?.polarity ?? 'FALLO')
      const m = await callStructured('probe_polarity_medido', SchemaMedido, [img, { text: `${PROMPT_MEDIDO}\n\n${ctx}` }])
      const hex = m?.package_hex ?? ''
      const l = hex ? hexToHsl(hex).l : NaN
      medidos.push(hex ? `${hex} (L=${l.toFixed(0)} → ${l < 50 ? 'dark' : 'light'})` : 'FALLO')
    }
    console.log(`  ${nombre}`)
    console.log(`    hoy   (el modelo juzga):  ${veredictos.join(' · ')}`)
    console.log(`    nuevo (el modelo mide):   ${medidos.join(' · ')}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
