/**
 * Lista los modelos que ven las DOS claves del hub. Read-only: no genera nada, no cuesta.
 * Existe para resolver los IDs exactos del recableado (Gemini 3.6 Flash, GPT 5.4 Nano,
 * GPT Image 2.5 Sunburst, Nano Banana Pro) contra la API y no contra la memoria.
 *
 *   npx tsx scripts/probe-models-list.ts [filtro]
 */
import fs from 'fs'
import path from 'path'

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const filtro = (process.argv[2] ?? '').toLowerCase()
const pasa = (id: string) => !filtro || id.toLowerCase().includes(filtro)

async function openai(): Promise<string[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json()) as { data?: { id: string }[]; error?: { message: string } }
  if (!res.ok || json.error) throw new Error(`${res.status} ${json.error?.message ?? ''}`)
  return (json.data ?? []).map((m) => m.id).filter(pasa).sort()
}

async function google(): Promise<string[]> {
  const ids: string[] = []
  const base = 'https://generativelanguage.googleapis.com/v1beta/models'
  let token = ''
  for (let i = 0; i < 10; i++) {
    const url = `${base}?key=${process.env.GOOGLE_API_KEY}&pageSize=200${token ? `&pageToken=${token}` : ''}`
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    const json = (await res.json()) as {
      models?: { name: string }[]
      nextPageToken?: string
      error?: { message: string }
    }
    if (!res.ok || json.error) throw new Error(`${res.status} ${json.error?.message ?? ''}`)
    for (const m of json.models ?? []) ids.push(m.name.replace(/^models\//, ''))
    if (!json.nextPageToken) break
    token = json.nextPageToken
  }
  return ids.filter(pasa).sort()
}

async function main() {
  for (const [nombre, fn] of [['OpenAI', openai], ['Google', google]] as const) {
    try {
      const ids = await fn()
      console.log(`\n=== ${nombre} · ${ids.length} modelos${filtro ? ` (filtro "${filtro}")` : ''} ===`)
      for (const id of ids) console.log('  ' + id)
    } catch (e) {
      console.log(`\n=== ${nombre} · FALLÓ ===\n  ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

main()
