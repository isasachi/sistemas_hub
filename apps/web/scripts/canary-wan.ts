/**
 * CANARIO DE `wan/3-0-video` — verifica el contrato SIN gastar un render.
 *
 * ⚠️ EL CANARIO GRATIS ES POR MODELO, NO DE KIE, y este repo ya pagó una lectura equivocada:
 * con **grok** un campo inválido vuelve SIN `taskId` y sin cobrar, así que mandando una
 * `duration` fuera de rango se verifica gratis todo lo demás. Con **kling y seedance** un campo
 * válido DESPACHA — lo único que no despacha es un modelo inexistente— y ahí el canario es
 * `creditsConsumed: 0.0`. Lo PRIMERO que hay que averiguar es de qué tipo es Wan.
 *
 * ⚠️ Y hay un fallo que NINGÚN canario puede cazar: el nombre del campo de referencias. Está
 * medido en `kie-image.ts` — mandando el equivocado, KIE crea la tarea, la termina con
 * `state: success` y devuelve material generado SOLO desde el prompt. Eso se comprueba mirando
 * un render, no un código de error.
 *
 *   npx tsx --env-file=.env.local scripts/canary-wan.ts
 */
const KEY = process.env.KIE_API_KEY
if (!KEY) throw new Error('Falta KIE_API_KEY')
const ENDPOINT = 'https://api.kie.ai/api/v1/jobs/createTask'
const IMG = 'https://example.com/a.png'

async function probe(nombre: string, input: Record<string, unknown>, model = 'wan/3-0-video') {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(60_000),
  })
  const j = await res.json().catch(() => null) as any
  const taskId = j?.data?.taskId
  console.log(`${taskId ? '🔴 DESPACHÓ' : '✅ rechazó '} · ${nombre}`)
  console.log(`     ${taskId ? `taskId ${taskId}` : `${j?.code} ${j?.msg}`}`)
  return { taskId, msg: String(j?.msg ?? '') }
}

async function main() {
  console.log('— ¿la validación corre ANTES de despachar? —')
  await probe('duration: 999 (fuera de rango)', { prompt: 'x', duration: 999 })
  await probe('modelo inexistente', { prompt: 'x', duration: 5 }, 'wan/no-existe')

  console.log('\n— el enum de resolution (con duration inválida de escudo) —')
  for (const r of ['720P', '720p', 'basura']) await probe(`resolution: ${r}`, { prompt: 'x', duration: 999, resolution: r })

  console.log('\n— el enum de aspect_ratio —')
  for (const a of ['9:16', 'basura']) await probe(`aspect_ratio: ${a}`, { prompt: 'x', duration: 999, aspect_ratio: a })

  console.log('\n— el rango de duration —')
  for (const d of [1, 2, 30, 31]) await probe(`duration: ${d}`, { prompt: 'x', duration: d, resolution: 'basura' })

  console.log('\n— el nombre del campo de imágenes —')
  await probe('reference_image_urls (el correcto)', { prompt: 'x', duration: 999, reference_image_urls: [IMG, IMG] })
  await probe('image_urls (el de grok — ¿se rechaza?)', { prompt: 'x', duration: 999, image_urls: [IMG, IMG] })
  await probe('campo inventado', { prompt: 'x', duration: 999, campo_que_no_existe: [IMG] })

  console.log('\n— audio y nsfw_checker —')
  await probe('audio: true', { prompt: 'x', duration: 999, audio: true })
  await probe('nsfw_checker: true', { prompt: 'x', duration: 999, nsfw_checker: true })
}
main().catch((e) => { console.error(e); process.exit(1) })
