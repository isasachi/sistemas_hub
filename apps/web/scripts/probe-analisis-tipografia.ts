/**
 * ¿Por qué el anuncio final inventa la tipografía en vez de copiar la de la referencia?
 *
 *   npx tsx scripts/probe-tipografia.ts        # solo texto+visión, barato
 *
 * MEDIDO en la sesión real `e50be4f7` (2026-09-17): la referencia tiene un titular blanco sans
 * bold en **Title Case** ("Want Clear, Glowing Skin?") y un subtítulo gris **serif itálico**
 * semitransparente. `reference_analysis.typography` devolvió "Caso: mayúsculas" y "Subtítulos:
 * sans-serif; regular; sin efectos", el instructivo de STEP5 transcribió eso al pie de la letra
 * ("ALL CAPS") y el render obedeció. O sea: el que se equivoca es el ANÁLISIS, no el render.
 *
 * Pero eso es n=1, y acá n=1 no es una medición. Dos preguntas:
 *   1. ¿"mayúsculas" es estable o fue un draw malo? → 3 draws con el modelo de hoy.
 *   2. ¿Es una REGRESIÓN del bump de modelo? El PR #115 subió el analizador de `gemini-2.5-flash`
 *      a `gemini-3.6-flash` horas antes de este testing. Brazo de control con el modelo viejo:
 *      si 2.5 lee bien el caso y 3.6 no, el arreglo es el modelo, no reescribir `step5.md`.
 */
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { GoogleGenAI, type Part, type Schema } from '@google/genai'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const REF = 'https://hryygojgihqazsmnduvh.supabase.co/storage/v1/object/public/ad-uploads/e50be4f7-ff38-4f02-a101-cb6d0c825638/reference.jpg'
const DRAWS = 3
const MODELOS = ['gemini-3.6-flash', 'gemini-2.5-flash'] as const

async function main() {
  const { ReferenceAnalysisSchema } = await import('../lib/types')
  const { SYSTEM_PROMPT } = await import('../lib/gemini')

  const res = await fetch(REF, { signal: AbortSignal.timeout(30_000) })
  const base64 = Buffer.from(await res.arrayBuffer()).toString('base64')

  // El MISMO texto que manda `app/api/generador-anuncios/sessions/[id]/analyze-reference/route.ts`.
  // Copiado y no importado porque vive inline en la ruta; si esa cambia, esto queda viejo a
  // propósito: el probe mide lo que se mandó el día que se corrió.
  const prompt = [
    'Analyze this reference ad. Return the complete structured analysis including all sceneElements.',
    'typography: describe the type so it can be REPRODUCED, block by block: typeface character',
    '(geometric sans, grotesque, high-contrast serif, condensed, script…), weight, case,',
    'letter-spacing, alignment, the size hierarchy between blocks, and any effect on the letters',
    '(outline, drop shadow, highlight box, angled or curved baseline, italics, underline).',
    'A one-word label like "modern" or "clean" is useless here — name what is actually on screen.',
    'creativeConcept: name the creative concept the ad IS and describe how it is built.',
    'Common concepts: before/after, testimonial, product demonstration, side-by-side comparison',
    'against an alternative, problem→solution, benefit list, offer/price, social-media screenshot,',
    'unboxing, expert endorsement. If none fits, name the one you actually see.',
    'If it is a BEFORE/AFTER, this is mandatory: state which half is which, where each sits, what',
    'label each carries, and what each side claims — the "before" half states the problem and the',
    '"after" half states the result, and they are NOT interchangeable.',
    'One or two sentences. Never a bare one-word label.',
    'bodyFocus + attentionMarkers: if the ad directs the viewer\'s attention to a specific body',
    'zone — arrows or lines pointing at it, a circle or highlight over it, a before/after pair',
    'contrasting it, a close-up of it — set bodyFocus to that zone and list every such marker',
    'in attentionMarkers with what it is and where it sits. If the ad points at no body zone,',
    'bodyFocus is null and attentionMarkers is null. Never guess a zone.',
  ].join('\n')

  const parts: Part[] = [{ inlineData: { mimeType: 'image/jpeg', data: base64 } }, { text: prompt }]
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })

  // La verdad de la referencia, mirada a ojo: titular Title Case blanco; subtítulo serif itálico
  // gris semitransparente. Se busca literal para no calificar a ojo 6 salidas.
  const aciertos = (t: string) => ({
    // El caso del titular: "Title Case"/"capitalización de título" bien, "mayúsculas"/"ALL CAPS" mal.
    capsMal: /may[úu]sculas|all\s*caps|uppercase/i.test(t.split(/subt[íi]tul|2\./i)[0]),
    italica: /it[áa]lic|cursiv|oblic/i.test(t),
    serif: /serif/i.test(t.replace(/sans[-\s]?serif/gi, '')),
    transparencia: /transparen|opacid|semitranspar/i.test(t),
  })

  for (const modelo of MODELOS) {
    console.log(`\n=== ${modelo} ===`)
    for (let i = 0; i < DRAWS; i++) {
      const t = Date.now()
      try {
        const r = await ai.models.generateContent({
          model: modelo,
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: z.toJSONSchema(ReferenceAnalysisSchema) as Schema,
          },
        })
        const obj = JSON.parse(r.text ?? '')
        const tipo = String(obj.typography ?? '')
        const a = aciertos(tipo)
        console.log(`  draw ${i + 1} (${((Date.now() - t) / 1000).toFixed(1)}s) · ratio leído: ${obj?.format?.ratio}`)
        console.log(`    caso del titular: ${a.capsMal ? '❌ dice MAYÚSCULAS (la ref es Title Case)' : '✅ no dice mayúsculas'}`)
        console.log(`    subtítulo — itálica: ${a.italica ? '✅' : '❌'} · serif: ${a.serif ? '✅' : '❌'} · transparencia: ${a.transparencia ? '✅' : '❌'}`)
        console.log(`    ${tipo.replace(/\s+/g, ' ').slice(0, 340)}`)
      } catch (e) {
        console.log(`  draw ${i + 1}: FALLÓ — ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`)
      }
    }
  }
}

main()
