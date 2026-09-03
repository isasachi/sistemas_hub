/**
 * ¿UN ANCLA POR LOTE ANCLARÍA EL FONDO, O SOLO MUEVE LA DERIVA UN PASO ATRÁS?
 *
 * Hoy las anclas solo se generan para un cambio de escena DENTRO de un lote, así que con
 * `maxPlanos = 1` casi nunca se generan (medido: 0 en las dos sesiones nuevas) y todos los
 * clips arrancan del avatar. Darle un ancla propia a CADA lote descansa en una premisa:
 * que dos imágenes generadas desde el mismo avatar conserven su habitación.
 *
 * ⚠️ ESA PREMISA NO SE PUEDE HEREDAR. AGENTS.md la tiene medida para **Nano Banana Pro**
 * (*"misma habitación, mismo pantalón, misma luz"*), y el camino de hoy es **gpt-image-2**:
 * otro modelo, otro resultado posible. Si las anclas derivan entre sí, la opción está
 * muerta y habríamos pagado N imágenes por mover el problema de lugar.
 *
 * ⚠️ Cuesta 2 imágenes (las paga el HUB, no la key del usuario). No escribe en la base ni
 * toca la cuota.
 *
 *   npx tsx --env-file=.env.local scripts/probe-anclas.ts <sessionId>
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { buildAnchorPrompt } from '../lib/video-ads/anchors'
import { generateImage } from '../lib/gemini'
import { camaraDeLote, type Lote } from '../lib/video-ads/lotes'

const SALIDA = process.env.PROBE_OUT ?? '/home/isasachi/.claude/jobs/29c3edaa/tmp/anclas2'
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Falta el sessionId')
  const { data } = await db.from('video_sessions').select('*').eq('id', id).single()
  const r = data as Record<string, unknown> & { lotes: Lote[] }
  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const cortes = (r.forensic_analysis as { cortes: { tiempo: string; camara: string }[] }).cortes
  await mkdir(SALIDA, { recursive: true })

  // Dos lotes SEPARADOS: si el fondo va a derivar, deriva entre escenas distintas.
  const elegidos = [r.lotes[1], r.lotes[3]].filter(Boolean)
  console.log(`sesión ${id.slice(0, 8)} · anclas de los lotes ${elegidos.map((l) => l.n).join(' y ')}\n`)

  await Promise.all(elegidos.map(async (lote) => {
    const prompt = buildAnchorPrompt({
      accionVisual: lote.tomas[0].accionVisual,
      camara: camaraDeLote(lote, cortes as never, ''),
      productDesc: scan.productDescription ?? '',
    })
    const b64 = await generateImage(
      [
        { fileData: { fileUri: r.avatar_url as string, mimeType: 'image/jpeg' } },
        { fileData: { fileUri: r.product_url as string, mimeType: 'image/jpeg' } },
        { text: prompt },
      ],
      1,
      // ⚠️ TIENE QUE SER EL MISMO PAR QUE LA RUTA. `generate-lotes` genera las anclas con
      // `preferGemini: true`, o sea nano-banana-2 de primario y gpt-image-2 de respaldo.
      // La primera versión de este probe lo omitió y midió gpt-image-2: la premisa habría
      // quedado verificada sobre un modelo que no es el que corre.
      { aspectRatio: '9:16', preferGemini: true },
    )
    await writeFile(`${SALIDA}/ancla-L${lote.n}.png`, Buffer.from(b64, 'base64'))
    console.log(`  lote ${lote.n}: ${SALIDA}/ancla-L${lote.n}.png`)
  }))

  await writeFile(`${SALIDA}/avatar.png`, Buffer.from(await (await fetch(r.avatar_url as string)).arrayBuffer()))
  console.log(`  avatar: ${SALIDA}/avatar.png`)
}

main().catch((e) => { console.error(e); process.exit(1) })
