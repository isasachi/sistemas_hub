// Importa a `data/dictionaries/` las keywords que el motor VIEJO tiene
// cacheadas en `ph_niches.keywords`.
//
//   npx tsx scripts/import-dictionaries.ts            (ph_niches + curados)
//   npx tsx scripts/import-dictionaries.ts --curados  (solo los escritos a mano)
//   npx tsx scripts/import-dictionaries.ts --dry-run  (solo cuenta)
//   npx tsx scripts/import-dictionaries.ts --force    (pisa los ya existentes)
//
// ── Por qué esto NO rompe ninguna regla ──────────────────────────────────────
// El motor nuevo no puede leer `ph_*` EN RUNTIME, y no lo hace: esto es un
// one-off que corre a mano, escribe archivos JSON versionados y se commitea. Lo
// que el pipeline lee después son los archivos, igual que siempre — dos corridas
// de la misma semilla siguen pidiendo exactamente las mismas keywords.
//
// ── Por qué las keywords viejas sirven ───────────────────────────────────────
// Se expandieron UNA vez con LLM y quedaron cacheadas (mediana 23 términos por
// nicho, en 4 direcciones: síntomas · zonas · situaciones · soluciones). El
// CONTEXT §4.1 permite exactamente eso: LLM fuera del pipeline, pagado una vez y
// servido indefinidamente. Re-generarlas sería pagar dos veces por lo mismo.
//
// ⚠️ NO SE CLASIFICAN EN LOS 5 GRUPOS, y no es pereza: el grupo SOLO decide el
// orden en que `expandKeyword` corta al llegar a `MAX_QUERIES_PER_SEED`. Con 23
// términos y un tope de 100 no corta nunca, así que cualquier clasificación
// sería decorativa — y una heurística equivocada sí puede tirar el término bueno
// cuando algún día sí corte. La semilla va en `problem` (es el término que nunca
// se debe perder) y el resto en `product`, que es como `resolveDictionary` ya
// trata las listas del motor viejo.
//
// ⚠️ NO SE FILTRAN LOS TÉRMINOS "SITUACIONALES" ("trabajo sedentario", "dormir
// mal"). Son una dirección deliberada de la expansión vieja y podarlos a ojo es
// adivinar: el mecanismo para eso es el `yield_rate` del bandit (spec §10), que
// apaga la combinación keyword×país que no rinde con datos, no con opinión.
import './bootstrap'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { isBlocked } from '@ph/shared'
import { normalizeQuery, dictionaryKey } from '../src/discovery/normalize-query'
import { readFileSync } from 'node:fs'

const DICT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../data/dictionaries')

interface NicheRow { id: string; keywords: string[] | null; status: string }

async function todosLosNichos(): Promise<NicheRow[]> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const out: NicheRow[] = []
  // Paginado por el tope silencioso de 1000 filas de PostgREST.
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db.from('ph_niches')
      .select('id,keywords,status').range(i, i + 999)
    if (error) throw new Error(`ph_niches: ${error.message}`)
    if (!data?.length) break
    out.push(...(data as NicheRow[]))
    if (data.length < 1000) break
  }
  return out
}

/**
 * Escribe UN diccionario. Devuelve 'escrito' | 'existe'.
 *
 * La semilla va en `problem` y el resto en `product`, por el mismo motivo
 * documentado arriba: el grupo solo importa por encima del tope de queries.
 */
function escribir(
  nicho: string, terminos: string[], force: boolean, dryRun: boolean,
): 'escrito' | 'existe' {
  const clave = dictionaryKey(nicho)
  const file = join(DICT_DIR, `${clave}.json`)
  if (existsSync(file) && !force) return 'existe'
  const semilla = normalizeQuery(nicho)
  const resto = [...new Set(terminos.map((t) => normalizeQuery(t)).filter((t) => t && t !== semilla))]
  const dict = { problem: [semilla], symptom: [], intent: [], commercial: [], product: resto }
  if (!dryRun) writeFileSync(file, JSON.stringify(dict, null, 2) + '\n')
  return 'escrito'
}

/**
 * Nichos escritos a mano (`data/nichos-curados.json`), para las categorías donde
 * el vocabulario importado quedaba flaco: ortopedia, mascotas, fitness, moda,
 * cocina, suplementos, skincare y hogar.
 *
 * ⚠️ VAN DESPUÉS de la importación y SIN `--force` por defecto, así que no pisan
 * un diccionario que ya exista: si un nicho está en las dos fuentes, gana el que
 * ya estaba (el importado tiene el vocabulario que la expansión con LLM produjo
 * para ESE nicho concreto).
 */
function importarCurados(force: boolean, dryRun: boolean): { escritos: number; saltados: number } {
  const file = join(DICT_DIR, '../nichos-curados.json')
  if (!existsSync(file)) return { escritos: 0, saltados: 0 }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  let escritos = 0, saltados = 0
  for (const [categoria, contenido] of Object.entries(raw)) {
    if (categoria.startsWith('_') || typeof contenido !== 'object' || !contenido) continue
    for (const [nicho, terminos] of Object.entries(contenido as Record<string, string[]>)) {
      if (!Array.isArray(terminos)) continue
      if (escribir(nicho, terminos, force, dryRun) === 'escrito') escritos++
      else saltados++
    }
  }
  return { escritos, saltados }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  const soloCurados = args.includes('--curados')

  if (!existsSync(DICT_DIR)) mkdirSync(DICT_DIR, { recursive: true })

  if (soloCurados) {
    const c = importarCurados(force, dryRun)
    console.log(`curados · ${c.escritos} ${dryRun ? 'a escribir' : 'escritos'} · ${c.saltados} ya existían`)
    return
  }

  const nichos = await todosLosNichos()
  let escritos = 0, saltados = 0, sinKeywords = 0, bloqueados = 0

  for (const n of nichos) {
    // Los `blocked` son typos y anatomía explícita que el cron de limpieza ya
    // apartó del motor viejo; importarlos los reviviría en el nuevo.
    if (n.status === 'blocked' || isBlocked(n.id)) { bloqueados++; continue }
    const kws = (n.keywords ?? []).map((k) => normalizeQuery(k)).filter(Boolean)
    if (!kws.length) { sinKeywords++; continue }

    // ⚠️ NO se pisa un diccionario existente sin `--force`: los curados a mano
    // son mejores que la expansión vieja, y este script no puede distinguirlos.
    if (escribir(n.id, kws, force, dryRun) === 'escrito') escritos++
    else saltados++
  }

  const c = importarCurados(force, dryRun)

  console.log(
    `${nichos.length} nichos leídos\n` +
    `  ${escritos} diccionarios ${dryRun ? 'a escribir' : 'escritos'}\n` +
    `  ${saltados} ya existían (usá --force para pisarlos)\n` +
    `  ${sinKeywords} sin keywords cacheadas\n` +
    `  ${bloqueados} bloqueados\n` +
    `  ${c.escritos} nichos curados a mano ${dryRun ? 'a escribir' : 'escritos'} ` +
    `(${c.saltados} ya existían)`,
  )
}

main().catch((e) => { console.error(e); process.exit(1) })
