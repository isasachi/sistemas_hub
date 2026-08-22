// Vocabulario (spec §2.5 y §10). Dos trabajos, ninguno toca Meta:
//
//   npx tsx src/cli/vocab.ts --seed      siembra los términos de los diccionarios
//   npx tsx src/cli/vocab.ts --extract   extrae términos de las landings auditadas
//   npx tsx src/cli/vocab.ts --idf       recalcula la distintividad
//   npx tsx src/cli/vocab.ts             las tres, en ese orden
//
// ⚠️ ESTO ES LO QUE REEMPLAZA A LA GENERACIÓN DE KEYWORDS POR LLM (CONTEXT D8).
// De cada landing que se auditó y resultó ser un producto físico salen los
// términos con los que el propio comerciante nombra lo que vende, y eso alimenta
// la siguiente ronda de búsqueda. Cuesta cero y mejora conforme crece la base.
import '../../scripts/bootstrap'
import { db } from '../db/client'
import { listDictionaries } from '../discovery/dictionaries'
import { upsertKeywords, actualizarIdf } from '../db/keywords'
import { extraerTerminos, idf, type LandingParaVocabulario } from '../vocab/terms'

/**
 * Siembra: cada diccionario es una semilla del vocabulario.
 *
 * ⚠️ Solo los diccionarios, NO los productos ya descubiertos. Un diccionario es
 * un nicho que alguien decidió mirar; un nombre de producto suelto entra por
 * `--extract`, con su fuente marcada, para poder distinguirlos después.
 */
async function sembrar(): Promise<void> {
  const semillas = listDictionaries().map((f) => f.replace(/_/g, ' '))
  const n = await upsertKeywords(semillas.map((term) => ({ term, source: 'seed' as const })))
  console.log(`siembra · ${semillas.length} diccionarios → ${n} términos nuevos`)
}

/** Los productos que salieron de una landing física ya verificada. */
async function landingsAuditadas(limite = 20_000): Promise<LandingParaVocabulario[]> {
  const out: LandingParaVocabulario[] = []
  for (let i = 0; i < limite; i += 1000) {
    const { data, error } = await db().from('disc_products')
      .select('canonical_name,product_type,brand').range(i, i + 999)
    if (error) throw new Error(`disc_products: ${error.message}`)
    if (!data?.length) break
    for (const p of data as { canonical_name: string | null; product_type: string | null; brand: string | null }[]) {
      out.push({ productName: p.canonical_name, productType: p.product_type, brand: p.brand })
    }
    if (data.length < 1000) break
  }
  return out
}

async function extraer(): Promise<void> {
  const landings = await landingsAuditadas()
  // `ocurrencias` es en cuántas landings distintas aparece el término: es el
  // denominador del IDF y se cuenta acá, mientras se recorre, en vez de con una
  // segunda pasada.
  const ocurrencias = new Map<string, number>()
  const fuentes = new Map<string, string>()
  for (const l of landings) {
    for (const t of extraerTerminos(l)) {
      ocurrencias.set(t.term, (ocurrencias.get(t.term) ?? 0) + 1)
      if (!fuentes.has(t.term)) fuentes.set(t.term, t.source)
    }
  }
  // ⚠️ UN TÉRMINO QUE APARECE UNA SOLA VEZ NO ENTRA. Con una ocurrencia no se
  // puede distinguir un nombre de producto genuino de una errata o del nombre
  // propio de un anunciante, y cada término de más es una búsqueda pagada.
  const utiles = [...ocurrencias.entries()].filter(([, n]) => n >= 2)
  const n = await upsertKeywords(utiles.map(([term]) => ({
    term, source: (fuentes.get(term) ?? 'product_name') as 'product_name',
  })))
  console.log(
    `extracción · ${landings.length} productos → ${ocurrencias.size} términos ` +
    `(${utiles.length} con ≥2 ocurrencias) → ${n} nuevos`,
  )
}

async function calcularIdf(): Promise<void> {
  const landings = await landingsAuditadas()
  const ocurrencias = new Map<string, number>()
  for (const l of landings) {
    for (const t of extraerTerminos(l)) ocurrencias.set(t.term, (ocurrencias.get(t.term) ?? 0) + 1)
  }
  const { data } = await db().from('disc_keywords').select('term').limit(50_000)
  const terminos = ((data ?? []) as { term: string }[]).map((r) => r.term)
  // Un término del vocabulario que NO aparece en ninguna landing es el caso
  // raro y por tanto el más distintivo: `idf(total, 0)` ya lo trata así porque
  // el denominador se acota a 1.
  const scores = terminos.map((term) => ({
    term, idf: idf(landings.length, ocurrencias.get(term) ?? 0),
  }))
  await actualizarIdf(scores)
  console.log(`idf · ${scores.length} términos puntuados contra ${landings.length} landings`)
}

async function main() {
  const args = process.argv.slice(2)
  const todo = !args.length
  if (todo || args.includes('--seed')) await sembrar()
  if (todo || args.includes('--extract')) await extraer()
  if (todo || args.includes('--idf')) await calcularIdf()
}

main().catch((e) => { console.error(e); process.exit(1) })
