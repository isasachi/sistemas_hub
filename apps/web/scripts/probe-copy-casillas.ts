/**
 * ¿El copy de landing pierde casillas al pasar Gemini a primario?
 *
 *   npx tsx scripts/probe-copy-casillas.ts        # 2 draws por sección (texto, barato)
 *
 * EL RIESGO, medido: con OpenAI de primario el schema iba por `toStrictSchema`, que mete TODAS las
 * propiedades en `required` y expresa lo opcional con `null`. Con Gemini de primario va PLANO (así
 * tiene que ser: aplicarle la transformación de OpenAI lo hace INVENTAR — `bulletsAfter` volvió
 * como un string dentro de un hero). Efecto lateral: de los 15 campos de `SectionCopy`, el schema
 * plano solo exige 2 (`kind`, `headline`). Los arrays que sostienen la plantilla siguen forzados
 * por `sectionCopySchema`, pero las CASILLAS de texto quedaron legalmente omitibles.
 *
 * Esto NO se puede decidir leyendo el schema: hay que ver si el modelo las llena igual. Dos draws
 * por sección porque `n = 1` no es una medición (ley del repo).
 */
import fs from 'fs'
import path from 'path'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const DRAWS = 2
// Las secciones cuyo valor ESTÁ en las casillas: si se omiten, la imagen sale con huecos.
const SECCIONES = ['cta-final', 'beneficios', 'testimonios'] as const

async function main() {
  const { generateLandingCopy } = await import('../lib/landing/copy')
  const { SECTION_DNA } = await import('../lib/landing/section-dna')

  const session = {
    id: 'probe', product_name: 'Sérum facial de vitamina C',
    price: 'S/ 89 con envío gratis',
    benefits: 'Ilumina el tono, atenúa manchas y marcas, hidrata sin grasa',
    audience: 'Mujeres de 25 a 45 en Lima que compran por Instagram',
    tone: ['cercano', 'confiable'], niche_id: 'skincare_female', demographic_id: 'female_30_45',
    body_focus: 'rostro', sections: [],
  } as never

  // Qué casilla espera cada sección, según lo que su plantilla dibuja.
  const CASILLAS = ['subheadline', 'kicker', 'closingBold', 'closingSub', 'closingStrip',
                    'socialProof', 'ctaHeadline', 'ctaSub', 'cta', 'accentWord'] as const

  for (const s of SECCIONES) {
    const req = (SECTION_DNA as Record<string, { requires?: Record<string, number> }>)[s]?.requires
    console.log(`\n=== ${s} ${req ? `(arrays forzados: ${JSON.stringify(req)})` : ''}`)
    for (let i = 0; i < DRAWS; i++) {
      const t = Date.now()
      try {
        const copy = await generateLandingCopy(session, [s])
        const sec = copy.find((c) => c.kind === s) as Record<string, unknown> | undefined
        if (!sec) { console.log(`  draw ${i + 1}: SIN SECCIÓN`); continue }
        const presentes = CASILLAS.filter((k) => sec[k] !== undefined && sec[k] !== null && sec[k] !== '')
        const arrays = ['bullets', 'bulletsAfter', 'cards'].filter((k) => Array.isArray(sec[k]))
          .map((k) => `${k}=${(sec[k] as unknown[]).length}`)
        console.log(`  draw ${i + 1} (${((Date.now() - t) / 1000).toFixed(1)}s): headline="${String(sec.headline).slice(0, 40)}"`)
        console.log(`    arrays: ${arrays.join(' ') || '—'}`)
        console.log(`    casillas presentes (${presentes.length}/${CASILLAS.length}): ${presentes.join(', ') || 'NINGUNA'}`)
      } catch (e) {
        console.log(`  draw ${i + 1}: FALLÓ — ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`)
      }
    }
  }
}

main()
