// ¿El árbitro gana algo? Mide el VOLUMEN de la banda dudosa sobre el corpus
// real y muestra sus veredictos para revisarlos a ojo.
//
// ⚠️ No se puede medir su precisión contra las etiquetas del propio árbitro:
// las produjo él. Lo que sí se puede medir sin circularidad es cuántos pares
// toca (o sea el costo) y cuántas fusiones NUEVAS produciría — y leerlas.
import './bootstrap'
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import { textoDeCluster, embeddings, UMBRAL_FUSION, fusionarPorEmbedding } from '../lib/product-hunter/cluster-merge'
import { paresDudosos, arbitrar, BANDA_MIN } from '../lib/product-hunter/arbitro'
import type { ClusterInfo } from '../lib/product-hunter/product-key'

config({ path: '../web/.env.local', override: true })

interface Fila { name: string | null; muestra: number; ad_count: number; clusters: Array<{ key: string; n: number; titulo: string | null; cuerpo?: string | null; url: string | null }> }

async function main() {
  const files = process.argv.slice(2).filter((a) => a.endsWith('.json'))
  const filas: Fila[] = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')))
  const conPares = filas.filter((r) => r.clusters.length >= 2).slice(0, Number(process.env.LIMITE ?? 60))

  let totalPares = 0, enBanda = 0, paginasConBanda = 0, fusionesNuevas = 0, cambianTramo = 0
  const ejemplos: string[] = []

  for (const r of conPares) {
    const cs: ClusterInfo[] = r.clusters.map((c) => ({
      key: c.key, n: c.n, titulo: c.titulo, cuerpo: c.cuerpo ?? null, url: c.url,
      estimado: Math.round((c.n / r.muestra) * r.ad_count), publicable: true,
    }))
    const vecs = await embeddings(cs.map(textoDeCluster))
    if (!vecs) { console.log('sin embeddings'); return }

    totalPares += (cs.length * (cs.length - 1)) / 2
    const dudosos = paresDudosos(cs, vecs)
    if (!dudosos.length) continue
    enBanda += dudosos.length
    paginasConBanda++

    const iguales = await arbitrar(cs, dudosos)
    fusionesNuevas += iguales.length

    // Lo que de verdad importa: ¿cambia el TRAMO del producto top? Fusionar
    // pares que igual caen en el mismo tramo no mueve nada para el usuario.
    const tramo = (n: number) => (n < 50 ? 0 : n < 100 ? 1 : 2)
    const soloCoseno = fusionarPorEmbedding(cs, vecs, UMBRAL_FUSION)
    const conArbitro = fusionarPorEmbedding(cs, vecs, UMBRAL_FUSION, iguales.map((p) => [p.i, p.j] as [number, number]))
    const a = Math.max(...soloCoseno.map((g) => g.estimado))
    const b = Math.max(...conArbitro.map((g) => g.estimado))
    if (tramo(a) !== tramo(b)) cambianTramo++
    for (const p of iguales.slice(0, 1)) {
      if (ejemplos.length >= 8) break
      ejemplos.push(
        `  ${p.sim.toFixed(3)} [${(r.name ?? '').slice(0, 22)}]\n` +
        `     A: ${textoDeCluster(cs[p.i]).slice(0, 78)}\n` +
        `     B: ${textoDeCluster(cs[p.j]).slice(0, 78)}`,
      )
    }
  }

  const base = conPares.reduce((a, r) => a + r.clusters.length, 0)
  console.log(`\n${conPares.length} páginas · ${base} clusters · ${totalPares} pares`)
  console.log(`banda [${BANDA_MIN}, ${UMBRAL_FUSION}): ${enBanda} pares en ${paginasConBanda} páginas ` +
    `(${(100 * enBanda / Math.max(1, totalPares)).toFixed(1)}% de los pares)`)
  console.log(`el árbitro fusionaría ${fusionesNuevas} pares MÁS que el coseno solo`)
  console.log(`páginas cuyo producto top CAMBIA DE TRAMO por el árbitro: ${cambianTramo} de ${conPares.length}`)
  console.log(`\n— fusiones que agregaría, para leerlas —\n${ejemplos.join('\n')}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
