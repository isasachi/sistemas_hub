// Pase de NOMBRE + DESCRIPCIÓN + veredicto sobre lo que ya está en la base.
//
//   npx tsx scripts/barrida-nombres.ts --min 50 [--limit 20] [--dry-run]
//
// ⚠️ NO SCRAPEA NADA. Todo lo que el veredicto necesita —`titulo`, `cuerpo`,
// `cluster_key`, `name`— ya está en la fila, así que esto es texto puro: sin
// navegador, sin IP, sin bloqueos de Meta. Es la diferencia con `scan-base.ts`,
// que vuelve a leer al anunciante y por eso se corta con los bloqueos.
//
// ⚠️ POR QUÉ PUEDE ESCRIBIR 'monoproducto' SIN MENTIR. El sello significa
// "share medido + cita verificada". La mitad MEDIDA ya está persistida en la
// fila (`muestra_n`/`muestra_tot`) y las que no pasaron el piso ya están en
// 'descartado', así que las que llegan acá son exactamente las publicables. Lo
// único que faltaba era la pregunta que solo un modelo puede responder.
//
// ⚠️ Corre en gpt-5.6-luna y no en Haiku: $0,20/$1,20 por millón contra
// $1,00/$5,00. Es el MISMO prompt y el MISMO schema (`nicho-verdict.ts`).
import './bootstrap'
import { juzgarNichoOpenAI, MODELO_OPENAI, usoOpenAI } from '../lib/product-hunter/nicho-verdict'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

interface Fila {
  niche: string; page_id: string; cluster_key: string
  titulo: string | null; cuerpo: string | null; name: string | null; ad_count: number
}

const arg = (n: string, def: number) => {
  const i = process.argv.indexOf(n)
  return i !== -1 ? Math.max(0, Number(process.argv[i + 1])) : def
}

async function main() {
  const min = arg('--min', 50)
  const limit = arg('--limit', 0)
  const dryRun = process.argv.includes('--dry-run')
  // --senal path: solo filas donde el término del nicho salió en la URL del
  // producto. Es el control del pase: ahí la pertenencia es casi segura, así que
  // un descarte masivo significaría que el prompt está de más.
  const si = process.argv.indexOf('--senal')
  const senal = si !== -1 ? process.argv[si + 1] : null
  const conc = arg('--conc', 6)

  // La cola: servibles del rango pedido que todavía no tienen nombre. Ordenada
  // por volumen — si se corta, se corta por la cola menos vista.
  const filas: Fila[] = []
  for (let off = 0; ; off += 1000) {
    let q = db.from('ph_raw_clusters')
      .select('niche,page_id,cluster_key,titulo,cuerpo,name,ad_count')
      .not('status', 'in', '("descartado","inactivo")')
      .gte('ad_count', min).is('product_name', null)
    if (senal) q = q.eq('senal_nicho', senal)
    const { data, error } = await q.order('ad_count', { ascending: false }).range(off, off + 999)
    if (error) throw new Error(error.message)
    filas.push(...(data as Fila[]))
    if (data!.length < 1000 || (limit && filas.length >= limit)) break
  }
  const cola = limit ? filas.slice(0, limit) : filas
  console.log(`${cola.length} filas · ${MODELO_OPENAI} · conc ${conc}${dryRun ? ' · DRY-RUN' : ''}\n`)

  let ok = 0, descartados = 0, sinTexto = 0, errores = 0
  let i = 0
  const worker = async () => {
    for (;;) {
      const f = cola[i++]; if (!f) return
      const textos = [f.titulo, f.cuerpo].filter((t): t is string => !!t)
      if (!textos.length) { sinTexto++; continue }
      try {
        const v = await juzgarNichoOpenAI({
          niche: f.niche, advertiser: f.name, productPath: f.cluster_key, textos,
        })
        const fisico = v.kind === 'fisico'
        const status = !fisico || !v.perteneceAlNicho ? 'descartado'
          : !v.citaVerificada ? 'sin_verificar'
          : 'monoproducto'
        const nota = !fisico ? `no es producto físico (${v.kind}): ${v.motivo}`
          : !v.perteneceAlNicho ? `fuera del nicho: ${v.motivo}`
          : !v.citaVerificada ? `sin cita textual que respalde el veredicto: ${v.motivo}`
          : v.motivo
        if (status === 'descartado') descartados++; else ok++
        const marca = status === 'descartado' ? '✗' : status === 'monoproducto' ? '✓' : '·'
        console.log(`  ${marca} ${String(f.ad_count).padStart(4)} ads · ${f.niche.slice(0,18).padEnd(18)} · ${(v.productName || '—').slice(0,30).padEnd(30)} · ${(v.descripcion || nota).slice(0,58)}`)
        if (!dryRun) {
          const { error } = await db.from('ph_raw_clusters').update({
            product_name: v.productName || null,
            descripcion: v.descripcion || null,
            status, kind: v.kind, verdict_note: nota,
            verified_at: new Date().toISOString(),
          }).eq('niche', f.niche).eq('page_id', f.page_id).eq('cluster_key', f.cluster_key)
          if (error) throw new Error(`update: ${error.message}`)
        }
      } catch (e) {
        errores++
        console.log(`  ! ${f.niche} / ${f.cluster_key.slice(0, 40)} — ${String((e as Error).message).slice(0, 90)}`)
      }
    }
  }
  await Promise.all(Array.from({ length: conc }, worker))
  console.log(`\n${ok} conservados · ${descartados} descartados · ${sinTexto} sin texto · ${errores} errores`)

  // Precio MEDIDO. Tarifa de gpt-5.6-luna: $0,20 / $1,20 por millón, y el input
  // cacheado a $0,02 — se descuenta aparte porque OpenAI ya lo informa.
  const u = usoOpenAI
  const noCache = u.input - u.inputCacheado
  const usd = (noCache * 0.20 + u.inputCacheado * 0.02 + u.output * 1.20) / 1e6
  console.log(`\n${u.llamadas} llamadas · in ${u.input} (${u.inputCacheado} cacheado) · out ${u.output}`)
  console.log(`costo: $${usd.toFixed(4)}  →  $${(usd / Math.max(1, u.llamadas)).toFixed(6)} por fila`)
}
main()
