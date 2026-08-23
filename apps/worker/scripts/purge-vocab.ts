// Desactiva del vocabulario los términos auto-extraídos que las reglas de hoy ya
// no aceptarían.
//
//   npx tsx scripts/purge-vocab.ts --dry-run
//   npx tsx scripts/purge-vocab.ts
//
// ⚠️ NO TOCA LAS SEMILLAS (`source = 'seed'`): esas salen de un diccionario que
// alguien decidió, no de una extracción automática.
//
// ⚠️ DESACTIVA, NO BORRA: `is_active = false` los saca del bandit conservando su
// historial de yield. Borrarlos arrastraría en cascada
// `disc_keyword_country_state`.
//
// Existe porque las reglas de extracción se endurecen con lo que se va midiendo,
// y un término que entró con las reglas viejas se queda gastando búsquedas para
// siempre: el daemon llegó a dedicarle un ciclo a `multi` y a `termica`.
import './bootstrap'
import { db } from '../src/db/client'
import { esTerminoUtil } from '../src/vocab/terms'

/** Las mismas dos reglas que `extraerTerminos` aplica hoy al nombre del producto. */
function aceptableHoy(term: string, source: string): boolean {
  if (!esTerminoUtil(term)) return false
  // Del NOMBRE solo se aceptan bigramas; `product_type` y `tag` pueden ser de
  // una palabra (son categorías, no fragmentos de un título).
  if (source === 'product_name' && !term.includes(' ')) return false
  return true
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const filas: { term: string; source: string }[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db().from('disc_keywords')
      .select('term,source').neq('source', 'seed').eq('is_active', true).range(i, i + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    filas.push(...(data as typeof filas))
    if (data.length < 1000) break
  }

  const fuera = filas.filter((f) => !aceptableHoy(f.term, f.source)).map((f) => f.term)
  console.log(
    `${filas.length} términos auto-extraídos activos · ${fuera.length} ya no pasan las reglas` +
    `${dryRun ? ' (DRY-RUN)' : ''}`,
  )
  console.log(`  ejemplos: ${fuera.slice(0, 20).join(' · ')}`)

  if (!dryRun) {
    for (let i = 0; i < fuera.length; i += 200) {
      const { error } = await db().from('disc_keywords')
        .update({ is_active: false }).in('term', fuera.slice(i, i + 200))
      if (error) throw new Error(error.message)
    }
    // Los jobs ya encolados de esos términos correrían igual: se borran. Un job
    // pendiente de un término apagado es trabajo que el bandit ya decidió no
    // hacer — y si es un `rank`, es además el deep crawl de sus anunciantes,
    // que es lo más caro que hace este motor.
    const { data: jobs } = await db().from('disc_jobs')
      .select('id,payload').in('kind', ['discover', 'rank']).eq('status', 'pending')
    const muertos = ((jobs ?? []) as { id: number; payload: { term?: string } }[])
      .filter((j) => j.payload?.term && fuera.includes(j.payload.term)).map((j) => j.id)
    for (let i = 0; i < muertos.length; i += 200) {
      await db().from('disc_jobs').delete().in('id', muertos.slice(i, i + 200))
    }
    const { count } = await db().from('disc_keywords')
      .select('*', { count: 'exact', head: true }).eq('is_active', true)
    console.log(`  ${fuera.length} desactivados · ${muertos.length} jobs pendientes borrados`)
    console.log(`  vocabulario activo: ${count}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
