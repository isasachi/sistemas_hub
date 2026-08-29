// Compara configuraciones del barrido con la MISMA vara y en la misma ventana.
//
//   npx tsx scripts/medir-palancas.ts [segundos-por-corrida]
//
// ⚠️ LA MÉTRICA ES "ANUNCIANTES NUEVOS LEÍDOS", NO FILAS PROCESADAS, y esa
// distinción ya me costó un número mal reportado: un tramo de la cola donde
// todas las filas son del mismo anunciante (o de uno en lista negra) se drena
// sin una sola lectura, y eso dio 33 filas/min cuando el ritmo real de fondo
// era 6. Los anunciantes nuevos con clusters escritos sí miden trabajo real.
//
// ⚠️ Cada config corre el MISMO tiempo, no el mismo número de filas: comparar a
// filas fijas premia a la config que agarró el tramo con más caché.
import './bootstrap'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function estado() {
  const [cola, anunciantes] = await Promise.all([
    db.from('ph_raw_products').select('*', { count: 'exact', head: true }).is('senal_nicho', null),
    db.from('ph_raw_clusters').select('page_id'),
  ])
  const unicos = new Set(((anunciantes.data ?? []) as { page_id: string }[]).map((r) => r.page_id))
  return { cola: cola.count ?? 0, anunciantes: unicos.size }
}

function correr(env: Record<string, string>, segundos: number): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn('npx', ['tsx', 'scripts/scan-base.ts', '--todo', '--sin-llm', '--solo-clusters', '--lote', '60'], {
      env: { ...process.env, ...env }, stdio: 'ignore',
    })
    let frios = 0
    const t = setTimeout(() => { p.kill('SIGKILL'); resolve(frios) }, segundos * 1000)
    p.on('exit', () => { clearTimeout(t); resolve(frios) })
  })
}

async function main() {
  const seg = Number(process.argv[2] ?? 300)
  const configs: Array<[string, Record<string, string>]> = [
    ['conc 2 · jitter 500 (actual)', { PH_CONCURRENCY: '2', PH_JITTER_MS: '500' }],
    ['conc 4 · jitter 500', { PH_CONCURRENCY: '4', PH_JITTER_MS: '500' }],
    ['conc 6 · jitter 500', { PH_CONCURRENCY: '6', PH_JITTER_MS: '500' }],
    ['conc 4 · jitter 0', { PH_CONCURRENCY: '4', PH_JITTER_MS: '0' }],
  ]
  console.log(`cada config corre ${seg}s\n`)
  console.log('config'.padEnd(30) + 'anunciantes/min   filas/min')
  for (const [nombre, env] of configs) {
    const antes = await estado()
    const t0 = Date.now()
    await correr(env, seg)
    // Deja asentar las escrituras en vuelo antes de medir.
    await new Promise((s) => setTimeout(s, 4000))
    const dsp = await estado()
    const min = (Date.now() - t0) / 60000
    const a = (dsp.anunciantes - antes.anunciantes) / min
    const f = (antes.cola - dsp.cola) / min
    console.log(nombre.padEnd(30) + a.toFixed(1).padStart(12) + f.toFixed(1).padStart(12))
    await new Promise((s) => setTimeout(s, 20_000))   // que se cierren los browsers
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
