// Canario GRATIS del body de `grok-imagine/image-to-video`.
//
// La validación de KIE corre ANTES de despachar la tarea: un `duration` fuera de rango
// devuelve un error SIN `taskId`, o sea sin cobrar. Eso deja probar el resto del cuerpo
// (modelo, `mode`, 7 imágenes, prompt de 5000) sin gastar un render.
//
//   npx tsx --env-file=.env.local scripts/canary-grok.ts
import { buildTaskBody, fetchKie } from '../lib/video-ads/kie'

const KEY = process.env.KIE_API_KEY
if (!KEY) throw new Error('Este canario necesita KIE_API_KEY en el entorno (solo para la prueba).')

const IMG = 'https://file.aiquickdraw.com/custom-page/akr/section-images/1755603646968-vs2n9c.jpg'

async function probar(nombre: string, body: unknown) {
  const res = await fetchKie('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as
    | { code?: number; msg?: string; data?: { taskId?: string } } | null
  const taskId = json?.data?.taskId
  console.log(
    `${nombre}\n   HTTP ${res.status} · code ${json?.code} · taskId ${taskId ?? '—'}` +
    `\n   msg: ${json?.msg ?? '(sin msg)'}`,
  )
  if (taskId) console.log('   ⚠️ SE CREÓ UNA TAREA (esto SÍ cobra) — revisa el body del canario.')
  return json
}

async function main() {
  // 1. El body real de este repo, pero con una duración inválida: valida TODO lo demás gratis.
  const real = buildTaskBody({
    images: [{ url: IMG, role: 'la persona' }, { url: IMG, role: 'el producto' }],
    prompt: 'A vertical UGC clip. The woman holds the product and speaks to camera.',
    durationSec: 12,
  })
  await probar('[1] body real + duration inválida (canario)', {
    ...real, input: { ...real.input, duration: '99' },
  })

  // 2. ¿Acepta las 7 imágenes? Misma duración inválida, así que sigue siendo gratis.
  await probar('[2] 7 imágenes', {
    ...real,
    input: { ...real.input, duration: '99', image_urls: Array(7).fill(IMG) },
  })

  // 3. ¿Y ocho? Debería quejarse del número de imágenes, no de la duración.
  await probar('[3] 8 imágenes (debe rechazar por imágenes)', {
    ...real,
    input: { ...real.input, duration: '99', image_urls: Array(8).fill(IMG) },
  })

  // 4. Prompt de 5000 exactos: el tope que dice la doc.
  await probar('[4] prompt de 5000 caracteres', {
    ...real, input: { ...real.input, duration: '99', prompt: 'a'.repeat(5000) },
  })

  // 5. Prompt de 5001: debería quejarse del prompt.
  await probar('[5] prompt de 5001 (debe rechazar por prompt)', {
    ...real, input: { ...real.input, duration: '99', prompt: 'a'.repeat(5001) },
  })

  // 6. ¿La duración como NÚMERO se rechaza? Medido: NO — la API acepta las dos formas,
  //    así que el String() del body es por la doc, no porque el number falle.
  await probar('[6] duration numérica fuera de rango', {
    ...real, input: { ...real.input, duration: 99 },
  })

  // 7-10. EL TRUCO INVERSO: una duración VÁLIDA junto a un prompt de 5001 (inválido).
  //    Ahora el freno que evita el cobro es el prompt, así que esto verifica gratis que
  //    la duración pasó la validación. Así se confirmaron los dos extremos del rango.
  for (const d of ['12', 12, '30', '6'] as const) {
    await probar(`[dur ${JSON.stringify(d)}] duración válida + prompt inválido`, {
      ...real, input: { ...real.input, duration: d, prompt: 'a'.repeat(5001) },
    })
  }
}

main()
