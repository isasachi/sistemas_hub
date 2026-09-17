/**
 * Mide el `statement_timeout` del serving por CATEGORÍA. Lectura pura de la base:
 * cero llamadas a modelos, no escribe nada.
 *
 *   npx tsx --env-file=.env.local scripts/probe-serving-timeout.ts [--tiros 3]
 *
 * El bug que lo motivó: `/api/buscador-productos/search` devolvía 500 con el
 * CUERPO VACÍO —"Unexpected end of JSON input" del lado del navegador— 38 veces
 * sobre 13 usuarios desde 2026-08-23. Causa: `57014 canceling statement due to
 * statement timeout` sobre el rango `0-50`, que tiene 79.316 filas servibles
 * contra 11k y 5k de los otros dos.
 *
 * ⚠️ ESTE PROBE ESTÁ INVERTIDO: el brazo de CONTROL (`viejo`) reconstruye el
 * comportamiento que se cambió —mandarle a la consulta la lista entera de nichos
 * cuando la categoría es "todos"—, y el brazo nuevo manda `null`. Si alguien
 * repone el `.in()` tautológico, este probe lo vuelve a medir sin tocarlo.
 *
 * ⚠️ `n = 1` NO ES UNA MEDICIÓN acá: el worker escribe sobre la misma tabla 24/7,
 * así que el reloj varía mucho entre tiros. Lo estable es el TIRO EN FRÍO y el
 * mecanismo del EXPLAIN (el planner estima rows=998 para `niche = ANY(674)` y
 * salen 79.316; subestima 79× y hace ~79k heap fetches). Por eso ≥3 tiros.
 *
 * El presupuesto es 8s: `statement_timeout` de `authenticator`, que `service_role`
 * no sobreescribe (`select rolname, rolconfig from pg_roles`).
 */
import {
  getApprovedByCategory, getNichesWithInventory, categoryOf,
  CATEGORIES, RAW_BUCKETS, PLANS, type RawBucket,
} from '@ph/shared'

const TIROS = process.argv.includes('--tiros')
  ? Number(process.argv[process.argv.indexOf('--tiros') + 1])
  : 3

const LIMITE = PLANS[3].porRango   // 50: el plan que más pide, o sea el peor caso

async function medir(label: string, niches: string[] | null, bucket: RawBucket) {
  const ms: number[] = []
  const salidas: string[] = []
  for (let i = 0; i < TIROS; i++) {
    const t = Date.now()
    try {
      const rows = await getApprovedByCategory(niches, bucket, LIMITE)
      salidas.push(String(rows.length))
    } catch (e) {
      // 57014 = statement timeout. Es EL fallo que se busca, no un imprevisto.
      salidas.push(`ERROR(${(e as Error).message.slice(0, 40)})`)
    }
    ms.push(Date.now() - t)
  }
  const peor = Math.max(...ms)
  const alarma = salidas.some((s) => s.startsWith('ERROR')) ? ' ← FALLA' : peor > 8000 ? ' ← PASA 8s' : ''
  console.log(`${label.padEnd(40)} ${salidas.join('/').padEnd(24)} ${ms.join('/')} ms${alarma}`)
}

async function main() {
  const inv = await getNichesWithInventory()
  console.log(`nichos con inventario: ${inv.length} · ${TIROS} tiros por brazo · limite ${LIMITE}\n`)

  console.log('— "todos", los tres rangos —')
  for (const b of RAW_BUCKETS as readonly RawBucket[]) {
    await medir(`  ${b} viejo (.in con ${inv.length} nichos)`, inv, b)
    await medir(`  ${b} nuevo (sin .in)`, null, b)
  }

  // Una categoría SÍ necesita su lista: ahí el filtro no es tautológico. Se mide
  // para saber cuánto aire queda antes de los 8s en el rango que ya falló.
  console.log('\n— rango 0-50 por categoría (el .in acá es legítimo) —')
  for (const c of CATEGORIES) {
    const ns = inv.filter((n) => categoryOf(n) === c.id)
    await medir(`  ${c.id} (${ns.length} nichos)`, ns, '0-50')
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
