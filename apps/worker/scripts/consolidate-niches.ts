// Aplica `data/nichos-consolidados.json`: fusiona, descarta y limpia el ruido
// de los diccionarios.
//
//   npx tsx scripts/consolidate-niches.ts --dry-run   (valida y reporta)
//   npx tsx scripts/consolidate-niches.ts             (aplica)
//
// ⚠️ LA DECISIÓN VIVE EN EL JSON, NO ACÁ. Este script solo la ejecuta, y su
// trabajo real es VALIDARLA: un nombre mal escrito en el plan sería una fusión
// que no ocurre y un archivo que sobrevive sin que nadie lo note.
//
// ⚠️ LO QUE SE DESCARTA NO SE BORRA DE LA BASE: `is_active = false` en
// `disc_keywords`. Eso lo saca del bandit —que es el objetivo— conservando su
// historial de yield; un DELETE arrastraría en cascada
// `disc_keyword_country_state`, que costó corridas reales contra Meta.
import './bootstrap'
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../src/db/client'
import { dictionaryKey } from '../src/discovery/normalize-query'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../data')
const DICT = join(DATA, 'dictionaries')

/** Un término en ≥ este nº de diccionarios no describe ningún nicho. */
const DF_MAX = Math.max(2, Number(process.env.DISC_DF_MAX ?? 8))

/**
 * Sufijos regionales que SE CONSERVAN, medidos sobre las búsquedas reales:
 * `farmacia` 13,5 anuncios por búsqueda, `remedio casero` 8,4, `drogueria` 4,5;
 * `botica` 0,4 y `cacharreria`/`chuchulucos` CERO en 4 y 5 búsquedas. En
 * conjunto los regionales eran el 12% de las búsquedas y el 3% de los anuncios.
 */
const REGIONALES_UTILES = new Set(['farmacia', 'remedio casero', 'drogueria'])

interface Plan {
  descartar: Record<string, string>
  fusionar: Record<string, string[] | string>
}

type Dicc = Record<string, string[]>

const leerDicc = (semilla: string): Dicc | null => {
  const f = join(DICT, `${dictionaryKey(semilla)}.json`)
  try { return JSON.parse(readFileSync(f, 'utf8')) as Dicc } catch { return null }
}
const terminosDe = (d: Dicc): string[] => [...new Set([
  ...(d.problem ?? []), ...(d.symptom ?? []), ...(d.intent ?? []),
  ...(d.commercial ?? []), ...(d.product ?? []),
])]

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const plan = JSON.parse(readFileSync(join(DATA, 'nichos-consolidados.json'), 'utf8')) as Plan
  const existentes = new Set(
    readdirSync(DICT).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
      .map((f) => f.replace(/\.json$/, '').replace(/_/g, ' ')),
  )

  // ── Validación del plan ───────────────────────────────────────────────────
  const desconocidos: string[] = []
  const descartar = Object.keys(plan.descartar)
  for (const n of descartar) if (!existentes.has(n)) desconocidos.push(`descartar: ${n}`)

  const absorbidosPor = new Map<string, string>()
  const fusiones: [string, string[]][] = []
  for (const [superviviente, absorbidos] of Object.entries(plan.fusionar)) {
    if (superviviente.startsWith('_') || !Array.isArray(absorbidos)) continue
    if (!existentes.has(superviviente)) { desconocidos.push(`superviviente: ${superviviente}`); continue }
    const validos: string[] = []
    for (const a of absorbidos) {
      if (!existentes.has(a)) { desconocidos.push(`absorbido: ${a}`); continue }
      // ⚠️ Un nicho absorbido DOS VECES sería un término que desaparece de un
      // superviviente sin avisar. Se reporta y se queda con la primera fusión.
      if (absorbidosPor.has(a)) { desconocidos.push(`absorbido dos veces: ${a} (ya en ${absorbidosPor.get(a)})`); continue }
      absorbidosPor.set(a, superviviente)
      validos.push(a)
    }
    fusiones.push([superviviente, validos])
  }

  // ⚠️ Un superviviente que ADEMÁS está en la lista de descarte dejaría a sus
  // absorbidos sin destino: sus términos se irían con él.
  for (const [s] of fusiones) if (plan.descartar[s]) desconocidos.push(`superviviente descartado: ${s}`)

  if (desconocidos.length) {
    console.log(`⚠️  ${desconocidos.length} entradas del plan no se pudieron resolver:`)
    for (const d of desconocidos) console.log(`    ${d}`)
    console.log('')
  }

  // ── Guard: no orfanar nada que ya tenga historia ──────────────────────────
  const fuera = new Set<string>([...descartar.filter((d) => existentes.has(d)), ...absorbidosPor.keys()])
  const { data: rk } = await db().from('disc_ranked').select('seed_query')
  const conProductos = new Set(((rk ?? []) as { seed_query: string }[]).map((r) => r.seed_query))
  const { data: kcs } = await db().from('disc_keyword_country_state').select('term').not('yield_rate', 'is', null)
  const conYield = new Set(((kcs ?? []) as { term: string }[]).map((r) => r.term))

  const rompe = [...fuera].filter((n) => conProductos.has(n))
  if (rompe.length) {
    console.log(`⚠️  ${rompe.length} nichos con PRODUCTOS ya servidos quedarían fuera: ${rompe.join(', ')}`)
    console.log('    (sus filas de disc_ranked siguen ahí, pero el nicho deja de buscarse)\n')
  }
  const pierdeYield = [...fuera].filter((n) => conYield.has(n) && !conProductos.has(n))
  if (pierdeYield.length) console.log(`ℹ️  ${pierdeYield.length} con yield medido quedan inactivos: ${pierdeYield.join(', ')}\n`)

  // ── Modelo en memoria: fusión + poda ──────────────────────────────────────
  //
  // ⚠️ TODO SE CALCULA ANTES DE ESCRIBIR NADA, y no es un detalle de estilo: la
  // versión anterior fusionaba en disco y DESPUÉS releía para podar, así que el
  // `--dry-run` —que no escribe— podaba sobre los diccionarios sin fusionar y
  // reportaba 0 términos quitados. Un dry-run que no describe lo que va a pasar
  // es peor que no tenerlo.
  const quedan = [...existentes].filter((n) => !fuera.has(n))
  const modelo = new Map<string, string[]>()
  let fusionados = 0
  for (const n of quedan) {
    const base = leerDicc(n)
    if (!base) continue
    const union = new Set(terminosDe(base))
    const absorbidos = fusiones.find(([s]) => s === n)?.[1] ?? []
    for (const a of absorbidos) {
      const d = leerDicc(a)
      if (d) for (const t of terminosDe(d)) union.add(t)
    }
    fusionados += absorbidos.length
    union.delete(n)
    modelo.set(n, [...union])
  }

  const df = new Map<string, number>()
  for (const ts of modelo.values()) for (const t of new Set(ts)) df.set(t, (df.get(t) ?? 0) + 1)
  const transversales = [...df.entries()].filter(([, v]) => v >= DF_MAX).sort((a, b) => b[1] - a[1])
  let quitados = 0
  for (const [n, ts] of modelo) {
    const limpio = ts.filter((t) => (df.get(t) ?? 0) < DF_MAX)
    quitados += ts.length - limpio.length
    modelo.set(n, limpio)
  }

  const emitidas = [...modelo.values()].reduce((a, ts) => a + ts.length + 1, 0)

  if (!dryRun) {
    for (const [n, ts] of modelo) {
      writeFileSync(join(DICT, `${dictionaryKey(n)}.json`), JSON.stringify({
        problem: [n], symptom: [], intent: [], commercial: [], product: ts,
      }, null, 2) + '\n')
    }
    for (const n of fuera) {
      try { unlinkSync(join(DICT, `${dictionaryKey(n)}.json`)) } catch { /* ya no estaba */ }
    }
  }

  // ── Regionales ────────────────────────────────────────────────────────────
  const regFile = join(DICT, '_regional.json')
  const reg = JSON.parse(readFileSync(regFile, 'utf8')) as Record<string, { terms: string[] }>
  const regLimpio: typeof reg = {}
  let regQuitados = 0
  for (const [pais, v] of Object.entries(reg)) {
    const utiles = v.terms.filter((t) => REGIONALES_UTILES.has(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()))
    regQuitados += v.terms.length - utiles.length
    regLimpio[pais] = { terms: utiles }
  }
  if (!dryRun) writeFileSync(regFile, JSON.stringify(regLimpio, null, 2) + '\n')

  // ── Base: desactivar lo que sale, limpiar la cola ─────────────────────────
  let desactivados = 0, jobsBorrados = 0, remapeados = 0, reactivados = 0
  if (!dryRun && fuera.size) {
    const lista = [...fuera]
    for (let i = 0; i < lista.length; i += 200) {
      const { data } = await db().from('disc_keywords')
        .update({ is_active: false }).in('term', lista.slice(i, i + 200)).select('term')
      desactivados += data?.length ?? 0
    }
    // ⚠️ Y SE REACTIVA LO QUE VUELVE. Re-aplicar el plan después de deshacer una
    // fusión demasiado gruesa devuelve nichos a la vida; sin esto se quedarían
    // con `is_active = false` de la corrida anterior, o sea con diccionario y
    // fuera del bandit — invisibles y sin que nada lo diga.
    const vivos = [...modelo.keys()]
    for (let i = 0; i < vivos.length; i += 200) {
      const { data } = await db().from('disc_keywords')
        .update({ is_active: true }).in('term', vivos.slice(i, i + 200))
        .eq('is_active', false).select('term')
      reactivados += data?.length ?? 0
    }
    // Jobs pendientes de un término que ya no resuelve: un `discover` correría
    // con el fallback de semilla pelada y parecería una búsqueda que funciona,
    // y un `rank` haría el DEEP CRAWL de sus anunciantes —el paso más caro
    // contra Meta— para un nicho ya jubilado. Medido: 5 rankings pendientes de
    // términos retirados sobrevivían a la consolidación.
    const { data: jobs } = await db().from('disc_jobs')
      .select('id,payload').in('kind', ['discover', 'rank']).eq('status', 'pending')
    const muertos = ((jobs ?? []) as { id: number; payload: { term?: string } }[])
      .filter((j) => j.payload?.term && fuera.has(j.payload.term)).map((j) => j.id)
    for (let i = 0; i < muertos.length; i += 200) {
      await db().from('disc_jobs').delete().in('id', muertos.slice(i, i + 200))
    }
    jobsBorrados = muertos.length

    // ⚠️ LAS FICHAS DE LA UI SALEN DE `disc_ranked.seed_query`. Sin este remapeo,
    // un producto descubierto como "rodilla" seguiría pintando la ficha "rodilla"
    // mientras ese nicho ya no existe ni se puede volver a buscar: una ficha que
    // no lleva a ningún lado. Se reapunta al superviviente, que es el nombre que
    // el usuario va a volver a ver.
    for (const [absorbido, superviviente] of absorbidosPor) {
      const { data } = await db().from('disc_ranked')
        .update({ seed_query: superviviente }).eq('seed_query', absorbido).select('dedupe_key')
      remapeados += data?.length ?? 0
    }
  }

  console.log(
    `${dryRun ? '[DRY-RUN] ' : ''}consolidación\n` +
    `  ${existentes.size} diccionarios → ${quedan.length}\n` +
    `    ${fusionados} absorbidos por una fusión\n` +
    `    ${descartar.filter((d) => existentes.has(d)).length} descartados (órgano / abstracción / clínico)\n` +
    `  ${quitados} términos transversales quitados (aparecían en ≥${DF_MAX} diccionarios)\n` +
    `  ${regQuitados} sufijos regionales quitados (se conservan: ${[...REGIONALES_UTILES].join(', ')})\n` +
    `  ${emitidas} queries por barrido (antes 15.919) · ${emitidas * 5} búsquedas con 5 países\n` +
    (dryRun ? '' : `  ${desactivados} términos desactivados · ${jobsBorrados} jobs muertos borrados · ` +
      `${remapeados} filas de disc_ranked reapuntadas · ${reactivados} términos reactivados\n`),
  )
  if (transversales.length) {
    console.log(`  los más transversales: ${transversales.slice(0, 10).map(([t, v]) => `${t}(${v})`).join(', ')}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
