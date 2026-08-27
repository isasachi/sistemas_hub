// ¿Fusionar clusters por embedding recupera productos repartidos en varias
// landings SIN pegar productos distintos de una tienda de catálogo?
//
//   npx tsx scripts/probe-clusters-embedding.ts <corpus.json...> [--pares] [--umbral 0.8]
//
// Corre OFFLINE sobre el corpus que dejó `medir-clusters.ts`: cero navegaciones,
// cero riesgo de bloqueo. Solo `text-embedding-3-small` (~$0.0013 por 3.500
// textos), cacheado en disco para que re-sweepear el umbral sea gratis.
//
// ⚠️ EL SESGO SE INVIERTE Y ESE ES EL PUNTO. Hoy `productKey` SUBESTIMA el share
// (un producto en tres landings cuenta como tres) y eso es seguro: descarta
// monoproductos legítimos en vez de publicar basura. Fusionar de más pega
// productos distintos y publica un catálogo como si fuera un producto — el
// fallo caro. Por eso el criterio NO es "cuánto fusiona" sino si existe un
// umbral que fusione CLIP STUDIO (/sc, /en, /es = un producto) y NO fusione
// Ofertas Colombia (kitdecuadernos, rollo-para-colorear = tres productos).
import './bootstrap'
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { CHAT } from '../lib/product-hunter/product-key'

// ⚠️ La OPENAI_API_KEY del worker es un PLACEHOLDER (`sk-....`) y la real vive
// en la env de apps/web. `override: true` no es opcional: `bootstrap` ya cargó
// la del worker y dotenv no pisa una variable existente, así que sin esto el
// probe muere con un 401 que parece de cuenta y es de precedencia de archivos.
config({ path: '../web/.env.local', override: true })

const CACHE = 'embeddings-clusters.json'
const MODEL = 'text-embedding-3-small'

interface Cluster { key: string; n: number; titulo: string | null; cuerpo?: string | null; url: string | null }
interface Fila { niche: string; page_id: string; name: string | null; status: string; ad_count: number; muestra: number; clusters: Cluster[] }

/** Lo que se embebe: el título del anuncio + el slug de la landing en palabras.
 *  El slug solo no alcanza (`/sc` vs `/en` no dicen nada) y el título solo
 *  tampoco (dos anuncios del mismo producto casi no comparten palabras).
 *
 *  ⚠️ EL SLUG DE UN LINK DE CHAT NO ENTRA — misma regla que `productKey`, y
 *  reusando su `CHAT` en vez de copiarla. Sin esto, `api.whatsapp.com/send`
 *  aporta el slug "send" a todos los clusters del anunciante y los textos
 *  colapsan: medido, daba 983 pares en la banda 0.9+ y ocho pares con
 *  similitud EXACTA 1.000 entre productos distintos. Es el mismo fallo que
 *  `product-key.ts` documenta, reintroducido por la puerta del embedding. */
function textoDe(c: Cluster): string {
  let slug = ''
  try {
    const u = new URL(c.url ?? '')
    if (!CHAT.test(u.hostname.replace(/^www\./, ''))) {
      slug = decodeURIComponent(u.pathname).replace(/[-_/]+/g, ' ').trim()
    }
  } catch { /* sin url: la clave ya es el título */ }
  // `cuerpo` (el copy del anuncio) es lo que el plan pedía embeber y lo que el
  // corpus viejo no tenía. Va PRIMERO: es el campo con más texto de producto.
  return [c.cuerpo ?? '', c.titulo ?? '', slug || c.key].filter(Boolean).join(' — ').slice(0, 600)
}

/**
 * Quita el andamiaje que TODOS los clusters de este anunciante comparten: el
 * título-plantilla ("MÁS VENDIDOS ✨ Aprovecha El Regalo De Hoy"), el reclamo
 * fijo ("Paga al Recibir 🏠"), el `products`/`collections` del path.
 *
 * Es la PASO 5 del plan ("quitaría texto completamente irrelevante"), y sin
 * ella el embedding mide el parecido de la plantilla y no el del producto:
 * medido, `collections/collares` vs `collections/anillos` daban 0.939 con el
 * mismo título plantilla, por encima del MISMO producto de CLIP STUDIO en dos
 * idiomas (0.714). El corte es por frecuencia dentro del anunciante, no una
 * lista negra: la plantilla de cada tienda es distinta y una lista global no la
 * ve. Si al sacarla no queda nada, se conserva el texto entero — un cluster sin
 * texto se parecería a todos.
 */
function sinBoilerplate(textos: string[]): string[] {
  if (textos.length < 3) return textos
  const df = new Map<string, number>()
  const toks = textos.map((t) => [...new Set(t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2))])
  for (const ts of toks) for (const w of ts) df.set(w, (df.get(w) ?? 0) + 1)
  const comun = new Set([...df].filter(([, n]) => n / textos.length >= 0.6).map(([w]) => w))
  return textos.map((t, i) => {
    const resto = toks[i].filter((w) => !comun.has(w)).join(' ')
    return resto.length >= 3 ? resto : t
  })
}

async function embed(textos: string[]): Promise<Map<string, number[]>> {
  const cache: Record<string, number[]> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}
  const faltan = textos.filter((t) => !cache[t])
  console.log(`[emb] ${textos.length} textos · ${faltan.length} sin cachear`)
  for (let i = 0; i < faltan.length; i += 256) {
    const lote = faltan.slice(i, i + 256)
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: MODEL, input: lote }),
    })
    const j = await r.json() as { data?: { embedding: number[] }[]; error?: { message: string } }
    if (j.error) throw new Error(j.error.message)
    j.data!.forEach((d, k) => { cache[lote[k]] = d.embedding })
    console.log(`[emb] ${Math.min(i + 256, faltan.length)}/${faltan.length}`)
  }
  if (faltan.length) writeFileSync(CACHE, JSON.stringify(cache))
  return new Map(textos.map((t) => [t, cache[t]]))
}

const cos = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return d / Math.sqrt(na * nb)
}

/** Enlace simple sobre el umbral. 15 líneas y determinista — HDBSCAN no tiene
 *  implementación usable en JS y con 6 puntos por página es inestable. */
function fusionar(cs: Cluster[], vec: number[][], umbral: number): number[][] {
  const padre = cs.map((_, i) => i)
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])))
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      if (cos(vec[i], vec[j]) >= umbral) padre[raiz(i)] = raiz(j)
    }
  }
  const grupos = new Map<number, number[]>()
  cs.forEach((_, i) => { const r = raiz(i); grupos.set(r, [...(grupos.get(r) ?? []), i]) })
  return [...grupos.values()]
}

async function main() {
  const files = process.argv.slice(2).filter((a) => a.endsWith('.json'))
  const filas: Fila[] = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')))
  const conPares = filas.filter((r) => r.clusters.length >= 2)
  // El texto de un cluster depende del ANUNCIANTE cuando se quita el
  // boilerplate, así que se resuelve por fila y no por cluster suelto.
  const limpio = process.argv.includes('--crudo') ? (t: string[]) => t : sinBoilerplate
  const textoPorFila = new Map(conPares.map((r) => [r, limpio(r.clusters.map(textoDe))]))
  const vecs = await embed([...new Set([...textoPorFila.values()].flat())])

  const vecDe = (r: Fila) => textoPorFila.get(r)!.map((t) => vecs.get(t)!)
  const txt = (r: Fila, i: number) => textoPorFila.get(r)![i]

  // ── Modo inspección: pares por banda de similitud, para etiquetar a mano ──
  if (process.argv.includes('--pares')) {
    const pares: Array<{ s: number; page: string; a: string; b: string }> = []
    for (const r of conPares) {
      const v = vecDe(r)
      for (let i = 0; i < r.clusters.length; i++) {
        for (let j = i + 1; j < r.clusters.length; j++) {
          pares.push({ s: cos(v[i], v[j]), page: r.name ?? r.page_id, a: txt(r, i), b: txt(r, j) })
        }
      }
    }
    for (const [lo, hi] of [[0.9, 1.01], [0.8, 0.9], [0.7, 0.8], [0.6, 0.7], [0.4, 0.6]]) {
      const banda = pares.filter((p) => p.s >= lo && p.s < hi)
      console.log(`\n===== similitud ${lo}-${hi} · ${banda.length} pares =====`)
      for (const p of banda.slice(0, 8)) {
        console.log(`  ${p.s.toFixed(3)} [${p.page.slice(0, 28)}]`)
        console.log(`     A: ${p.a.slice(0, 95)}`)
        console.log(`     B: ${p.b.slice(0, 95)}`)
      }
    }
    return
  }

  // ── Árbitro: gpt-5.6-luna etiqueta pares y con eso se mide el umbral ──
  // Es la capa final del plan ("solo los casos dudosos al LLM"), usada acá para
  // producir el ground truth que ningún umbral puede tener a ojo. Se muestrea
  // por BANDA de similitud, no al azar: al azar casi todos los pares son
  // obviamente distintos y la precisión saldría alta sin significar nada.
  if (process.argv.includes('--arbitro')) {
    const pares: Array<{ s: number; page: string; a: string; b: string }> = []
    for (const r of conPares) {
      const v = vecDe(r)
      for (let i = 0; i < r.clusters.length; i++) {
        for (let j = i + 1; j < r.clusters.length; j++) {
          pares.push({ s: cos(v[i], v[j]), page: r.name ?? r.page_id, a: txt(r, i), b: txt(r, j) })
        }
      }
    }
    const POR_BANDA = 35
    const muestra: typeof pares = []
    for (const [lo, hi] of [[0.9, 1.01], [0.8, 0.9], [0.7, 0.8], [0.6, 0.7]]) {
      const banda = pares.filter((p) => p.s >= lo && p.s < hi)
      const paso = Math.max(1, Math.floor(banda.length / POR_BANDA))
      for (let i = 0, n = 0; i < banda.length && n < POR_BANDA; i += paso, n++) muestra.push(banda[i])
    }
    console.log(`[árbitro] ${muestra.length} pares a etiquetar con gpt-5.6-luna`)
    const veredictos: Array<{ p: (typeof pares)[0]; same: boolean }> = []
    for (let i = 0; i < muestra.length; i += 10) {
      const lote = muestra.slice(i, i + 10)
      const prompt = 'Cada item son DOS anuncios del MISMO anunciante. Decide si promocionan el MISMO producto ' +
        '(mismo artículo o servicio concreto) o productos DISTINTOS. Dos anuncios con el mismo reclamo promocional ' +
        'pero distinto artículo son DISTINTOS. Un mismo artículo con copy en otro idioma o en otra landing es el MISMO.\n' +
        'Devuelve JSON {"r":[{"i":0,"same":true}, ...]} con un item por par.\n\n' +
        lote.map((p, k) => `[${k}] anunciante: ${p.page}\n  A: ${p.a.slice(0, 260)}\n  B: ${p.b.slice(0, 260)}`).join('\n\n')
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-5.6-luna',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      })
      const j = await res.json() as { choices?: { message: { content: string } }[]; error?: { message: string } }
      if (j.error) throw new Error(j.error.message)
      const out = JSON.parse(j.choices![0].message.content) as { r: { i: number; same: boolean }[] }
      for (const v of out.r) if (lote[v.i]) veredictos.push({ p: lote[v.i], same: v.same })
      console.log(`[árbitro] ${veredictos.length}/${muestra.length}`)
    }

    console.log('\numbral | fusiones correctas | fusiones ERRÓNEAS | precisión | recall')
    const mismos = veredictos.filter((v) => v.same).length
    for (const u of [0.95, 0.92, 0.9, 0.88, 0.85, 0.82, 0.8, 0.75, 0.7]) {
      const sobre = veredictos.filter((v) => v.p.s >= u)
      const ok = sobre.filter((v) => v.same).length
      const mal = sobre.length - ok
      console.log(`${u.toFixed(2).padStart(6)} | ${String(ok).padStart(18)} | ${String(mal).padStart(17)} | ` +
        `${(sobre.length ? ok / sobre.length : 1).toFixed(2).padStart(9)} | ${(ok / mismos).toFixed(2).padStart(6)}`)
    }
    console.log(`\n(${mismos}/${veredictos.length} pares etiquetados como MISMO producto)`)
    console.log('\n— muestra de etiquetas, para revisar a ojo —')
    for (const v of veredictos.filter((x) => x.p.s >= 0.85).slice(0, 6)) {
      console.log(`  ${v.p.s.toFixed(3)} ${v.same ? 'MISMO ' : 'DISTINTO'} [${v.p.page.slice(0, 24)}]`)
      console.log(`     A: ${v.p.a.slice(0, 80)}`)
      console.log(`     B: ${v.p.b.slice(0, 80)}`)
    }
    return
  }

  // ── Sweep: qué le hace cada umbral al share y al tramo ──
  const tramo = (n: number) => (n < 50 ? '0-50' : n < 100 ? '50-100' : '100+')
  console.log('\numbral | share top medio | páginas que fusionan | clusters fusionados | suben de tramo')
  for (const u of [1.01, 0.95, 0.9, 0.88, 0.85, 0.82, 0.8, 0.75, 0.7, 0.6]) {
    let share = 0, fusionan = 0, absorbidos = 0, suben = 0
    for (const r of conPares) {
      const v = vecDe(r)
      const grupos = fusionar(r.clusters, v, u)
      const tops = grupos.map((g) => g.reduce((a, i) => a + r.clusters[i].n, 0))
      const top = Math.max(...tops)
      share += top / r.muestra
      if (grupos.length < r.clusters.length) { fusionan++; absorbidos += r.clusters.length - grupos.length }
      const antes = Math.round((r.clusters[0].n / r.muestra) * r.ad_count)
      const ahora = Math.round((top / r.muestra) * r.ad_count)
      if (tramo(ahora) !== tramo(antes)) suben++
    }
    const et = u > 1 ? 'sin fusión' : u.toFixed(2)
    console.log(`${et.padStart(10)} | ${(share / conPares.length).toFixed(3).padStart(15)} | ` +
      `${String(`${fusionan}/${conPares.length}`).padStart(20)} | ${String(absorbidos).padStart(19)} | ${String(suben).padStart(14)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
