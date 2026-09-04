/**
 * ¿GROK DICE LA LOCUCIÓN EN ESPAÑOL PALABRA POR PALABRA?
 *
 * Es el riesgo más grande de la tool y estuvo sin medir desde la vuelta a grok: la doc del
 * modelo dice que el prompt es *English only* y la locución viaja entrecomillada en
 * español. Si grok traduce, resume o destroza esa línea, el entregable se rompe y se
 * descubre recién al renderizar.
 *
 * No hace falta gastar un render: se transcriben clips YA pagados y se comparan contra la
 * locución exacta que se les pidió. La comparación es mecánica —hay oráculo—, así que esto
 * es un pass/fail, no una impresión.
 *
 * ⚠️ Va SIN SCHEMA a propósito. AGENTS.md tiene medido que `schema + base64` revienta con
 * un video grande (13,6 MB, `400 "The server is currently being maintained"` que miente);
 * sin schema la base64 funciona, y acá lo único que se necesita es texto plano.
 *
 * ⚠️ Cuesta una llamada de visión por clip. No gasta cuota del hub ni escribe en la base.
 *
 *   npx tsx --env-file=.env.local scripts/probe-audio-espanol.ts <clip.mp4> "<locución esperada>"
 */
import { readFile } from 'node:fs/promises'
import { KIE_GEMINI_MODEL } from '../lib/kie-gemini'

// ⚠️ Va por KIE y no por `@google/genai` porque ése es el camino de PRODUCCIÓN del hub desde
// 2026-08-25 — y además, medido acá, la `GOOGLE_API_KEY` local devuelve `429 prepayment
// credits are depleted`, o sea que el escape `GEMINI_VIA=direct` hoy no funcionaría.
const URL = `${process.env.KIE_API_BASE ?? 'https://api.kie.ai'}/${KIE_GEMINI_MODEL}/v1/chat/completions`

async function kieChat(content: unknown[]): Promise<string> {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}`, 'Content-Type': 'application/json' },
    // `stream` e `include_thoughts` vienen en true por defecto y rompen el parse: ver AGENTS.md.
    body: JSON.stringify({
      model: KIE_GEMINI_MODEL, stream: false, include_thoughts: false,
      max_tokens: 4096, temperature: 0,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(180_000),
  })
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const code = typeof json?.code === 'number' ? json.code : null
  // KIE responde HTTP 200 con el error DENTRO del cuerpo.
  if (!res.ok || (code !== null && code !== 200) || json?.error) {
    throw new Error(`KIE → ${res.status} ${JSON.stringify(json).slice(0, 300)}`)
  }
  const c = (json?.choices as { message?: { content?: string } }[] | undefined)?.[0]
  return c?.message?.content ?? ''
}

/**
 * Sin acentos, sin puntuación, sin espacios y en minúsculas.
 *
 * ⚠️ SE COMPARA POR CARACTER Y NO POR PALABRA, y no es un detalle: por palabra hay que
 * elegir qué hacer con el guion y **las dos opciones pierden un caso real**. Borrándolo,
 * `anti-envejecimiento` casa con `antienvejecimiento` (✓) pero `La Roche-Posay` deja de
 * casar con `La Roche Posay` (✗). Convirtiéndolo en espacio, al revés. Los dos casos
 * salieron en el MISMO clip. Sin espacios ninguno de los dos existe.
 */
function normalizar(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]/g, '')
}

/**
 * Fracción de las palabras esperadas que sobreviven, por SUBSECUENCIA COMÚN MÁS LARGA.
 *
 * ⚠️ LA PRIMERA VERSIÓN ERA UN AVANCE GREEDY DE UN PUNTERO Y DABA FALSOS NEGATIVOS
 * CATASTRÓFICOS: se atascaba en la primera palabra que faltaba y no se recuperaba nunca.
 * Medido — grok dijo *"Este es ESTE suero…"* donde se esperaba *"Este es EL suero…"*, o sea
 * una sola palabra cambiada de diecisiete, y el puntero se quedó clavado en `el` para el
 * resto de la frase: reportó **11 %** sobre una locución prácticamente perfecta. Con esa
 * métrica habría concluido que el modelo no dice el español, que es exactamente al revés.
 * La LCS tolera sustituciones puntuales sin dejar de castigar los cortes y las traducciones.
 */
export function cobertura(esperado: string, dicho: string): number {
  const e = normalizar(esperado)
  const d = normalizar(dicho)
  if (!e.length) return 1
  // ponytail: LCS O(n·m) sobre dos filas; son locuciones de cientos de caracteres, alcanza.
  let prev = new Array<number>(d.length + 1).fill(0)
  for (const pe of e) {
    const cur = new Array<number>(d.length + 1).fill(0)
    for (let j = 0; j < d.length; j++) {
      cur[j + 1] = pe === d[j] ? prev[j] + 1 : Math.max(cur[j], prev[j + 1])
    }
    prev = cur
  }
  return prev[d.length] / e.length
}

/** Transcribe un clip. `ruta` es un archivo local o una URL http(s). Exportada para que
 *  `probe-anuncio.ts` mida los N draws de cada corte sin duplicar la llamada. */
export async function transcribir(ruta: string): Promise<{ dicho: string; idioma: string }> {
  // ⚠️ LA BASE64 DEJÓ DE ACEPTARSE PARA VIDEO (medido 2026-09-04): un clip de 2,4 MB devuelve
  // `400 "Inline data URL is too large. Upload the file and pass an HTTP(S) URL instead."`.
  // AGENTS.md dice que la base64 sí funciona; eso valía para videos chicos y ya no vale acá.
  // Por eso `ruta` acepta también una URL http(s), que es el camino que el forense ya usa.
  const url = /^https?:\/\//.test(ruta)
    ? ruta
    : `data:video/mp4;base64,${(await readFile(ruta)).toString('base64')}`
  const salida = (await kieChat([
    { type: 'image_url', image_url: { url } },
    {
      type: 'text',
      text: [
        'Transcribe EXACTAMENTE lo que dice la persona en el audio de este video.',
        'Palabra por palabra, sin corregir, sin traducir y sin resumir.',
        'Si repite una frase, escríbela las dos veces. Si no se entiende una palabra, escribe [?].',
        'Responde SOLO con la transcripción, sin comillas ni comentarios.',
        'Después de la transcripción, en una línea aparte, escribe: IDIOMA: <el idioma que habla>',
      ].join('\n'),
    },
  ])).trim()
  return {
    idioma: salida.match(/IDIOMA:\s*(.+)$/im)?.[1]?.trim() ?? '(no lo dijo)',
    dicho: salida.replace(/IDIOMA:.*$/im, '').trim(),
  }
}

async function main() {
  const [ruta, esperado] = process.argv.slice(2)
  if (!ruta || !esperado) throw new Error('Uso: probe-audio-espanol.ts <clip.mp4> "<locución esperada>"')
  const { dicho, idioma } = await transcribir(ruta)
  const pct = cobertura(esperado, dicho)
  // ⚠️ LA COBERTURA SOLA NO VE LAS INSERCIONES, y eso deja pasar un tartamudeo como perfecto:
  // medido 2026-09-04, un clip que dijo "es momento de DE empezar" dio 100%. El LCS mide qué
  // fracción de lo ESPERADO aparece, así que una palabra de más no le cuesta nada. La precisión
  // (el mismo LCS sobre lo DICHO) sí baja, y con las dos el tropiezo se ve.
  const prec = cobertura(dicho, esperado)

  console.log(`\n${ruta.split('/').pop()}`)
  console.log(`  esperado: ${esperado}`)
  console.log(`  dicho:    ${dicho.replace(/\n/g, ' ')}`)
  console.log(`  idioma:   ${idioma}`)
  console.log(`  cobertura: ${(pct * 100).toFixed(0)}% de lo esperado · precisión: ${(prec * 100).toFixed(0)}% de lo dicho (LCS)`)
  console.log(`  ${pct >= 0.9 ? '✅ dice la locución' : pct >= 0.6 ? '⚠️ la dice a medias' : '❌ NO dice la locución'}${prec < 0.99 ? ' — pero AGREGA texto (repeticiones o relleno)' : ''}`)
  // ⚠️ IMPRIME ADEMÁS DE PUNTUAR, a propósito: el umbral es una heurística y ya dio un falso
  // negativo. Lee las dos líneas antes de creerle al símbolo.
}

// Solo corre invocado directamente: el test importa `cobertura` de acá y sin este guard
// el import dispararía la llamada pagada a KIE.
if (process.argv[1]?.endsWith('probe-audio-espanol.ts')) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
