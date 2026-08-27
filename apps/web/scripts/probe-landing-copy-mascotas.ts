/**
 * Re-genera el copy de una sesión REAL (por defecto la de snacks para perro) y lo audita: texto
 * cortado o pegado a su tope, bullets a medias, usted, claims de salud duros, cifras de prueba
 * social, compromisos verificables inventados, instrucciones de uso en la franja de cierre y
 * bullets desincronizados entre hero y cta-final.
 *
 * ⚠️ EL PROBE IMPRIME ADEMÁS DE PUNTUAR, y eso no es decoración: la salida es estocástica y varias
 * de sus reglas son regex, así que un ❌ puede estar midiendo la regex y no el copy. Ya pasó dos
 * veces acá —"fortalece su educación" marcado como claim médico, y un titular completo marcado por
 * no terminar en punto—. Lee el texto antes de creerle al contador.
 *
 * Solo texto: cero imágenes, cero cuota de imagen. No escribe en la base.
 *
 *   npx tsx --env-file=.env.local scripts/probe-landing-copy-mascotas.ts [id]
 */
import { getLandingSession } from '../lib/landing/db'
import { createClient } from '@supabase/supabase-js'
import { generateLandingCopy } from '../lib/landing/copy'
import { SECTION_DNA } from '../lib/landing/section-dna'
import type { SectionCopy, SectionType } from '../lib/landing/types'

const ID = process.argv[2] ?? '732e2aac'

// Los topes que el schema le impone a cada campo: si un texto sale EXACTO en su tope, lo
// recortó el clamp (o el modelo se pegó al borde), que es el defecto que se vino a cerrar.
const TOPES: Record<string, number> = { headline: 90, subheadline: 120, kicker: 45, cta: 30, closingStrip: 70 }

const USTED = /\b(usted|su dinero|le devolvemos|solicite|puede confiar|díganos|comuníquese)\b/i
// ⚠️ El verbo duro SOLO cuenta sobre un objeto de SALUD: "fortalece su educación" es adiestramiento,
// no un claim médico, y la primera versión de este probe lo marcaba — medía la regex, no el copy.
const SALUD = 'digesti\\w+|defensas|sistema inmune|ansiedad|estr[eé]s|sue[ñn]o|art(rosis|ritis)|articulaci\\w+|piel|pelaje|enc[ií]as|dolor|alerg\\w+|peso'
const DURO = new RegExp(`\\b(cura|curan|elimina|eliminan|previene|previenen|fortalece|fortalecen|mejora|mejoran|corrige|corrigen|combate|combaten)\\b[^.!?]{0,20}\\b(${SALUD})`, 'i')
const CIFRA_SOCIAL = /\b(miles|cientos|\d[\d.,]*\s*(mil|clientes|peruanos|familias|perros)|\d+\s*%\s*de\s*(los|las))\b/i
// Compromisos verificables que nadie declaró: origen, plazos, avales.
const COMPROMISO = /\b(\d+\s*d[ií]as?\s*(h[áa]biles)?|producid\w+ en|fabricad\w+ en|hecho en|certificad\w+ por|avalad\w+|aprobad\w+ por|\d+\s*a[ñn]os de (experiencia|trayectoria))\b/i
const IMPERATIVO_USO = /\b(dáse|dásela|dáselas|dale|adminis|dosis|a primera hora|antes de dormir|después de comer)\w*/i

// ⚠️ Un titular que NO termina en punto está completo: exigir puntuación final medía la regex y no
// el copy ("¡Snacks suaves, sabrosos!, ideales para perros pequeños" salía marcado). Lo que delata
// un corte es terminar en un conector, una coma o una palabra que pide continuación. Los DOS
// PUNTOS no: un titular que presenta las cards está completo.
const COLGANDO = /(^|\s)(y|o|u|e|de|del|la|el|los|las|un|una|con|sin|por|para|que|en|a|al|su|sus|tu|tus|más|muy|como|desde|hasta)\s*$|[,;–—-]\s*$/i
function frasesCompletas(s: string): boolean {
  return !COLGANDO.test(s.trim())
}

function revisar(secciones: SectionType[], copy: SectionCopy[]) {
  const fallos: string[] = []
  for (const c of copy) {
    const campos: [string, string | undefined][] = [
      ['headline', c.headline], ['subheadline', c.subheadline], ['kicker', c.kicker],
      ['cta', c.cta], ['closingStrip', c.closingStrip],
    ]
    for (const [campo, v] of campos) {
      if (!v) continue
      const tope = TOPES[campo]
      if (tope && v.length === tope) fallos.push(`[recorte] ${c.kind}.${campo} sale EXACTO en su tope (${tope}): "${v}"`)
      if (!frasesCompletas(v)) fallos.push(`[cortado] ${c.kind}.${campo} termina a mitad de frase: "${v}"`)
      if (USTED.test(v)) fallos.push(`[usted] ${c.kind}.${campo}: "${v}"`)
      if (DURO.test(v)) fallos.push(`[claim duro] ${c.kind}.${campo}: "${v}"`)
      if (CIFRA_SOCIAL.test(v)) fallos.push(`[prueba social con cifra] ${c.kind}.${campo}: "${v}"`)
      if (COMPROMISO.test(v)) fallos.push(`[compromiso inventado] ${c.kind}.${campo}: "${v}"`)
    }
    if (c.closingStrip && IMPERATIVO_USO.test(c.closingStrip))
      fallos.push(`[instrucción de uso] ${c.kind}.closingStrip: "${c.closingStrip}"`)
    // El " — " solo aplica donde la composición dibuja DOS líneas por bullet. En `antes-despues`
    // la lista es de ✗/✓ de una línea, así que un bullet suelto ahí es correcto.
    const dosLineas = c.kind === 'hero' || c.kind === 'beneficios' || c.kind === 'cta-final'
    for (const b of [...(c.bullets ?? []), ...(c.bulletsAfter ?? [])]) {
      if (dosLineas && !b.includes(' — ')) fallos.push(`[bullet a medias] ${c.kind}: "${b}" (sin " — ", el render inventa la 2.ª línea)`)
      if (/[\s,;:–-]$/.test(b)) fallos.push(`[bullet cortado] ${c.kind}: "${b}"`)
      if (DURO.test(b)) fallos.push(`[claim duro] ${c.kind} bullet: "${b}"`)
    }
    for (const t of c.cards ?? []) {
      const txt = [t.title, t.body].filter(Boolean).join(' ')
      if (DURO.test(txt)) fallos.push(`[claim duro] ${c.kind} card: "${txt}"`)
      if (CIFRA_SOCIAL.test(txt)) fallos.push(`[prueba social con cifra] ${c.kind} card: "${txt}"`)
      if (COMPROMISO.test(txt)) fallos.push(`[compromiso inventado] ${c.kind} card: "${txt}"`)
    }
    if (c.kind === 'antes-despues' && /^(antes|despu[eé]s)\b/i.test(c.headline ?? ''))
      fallos.push(`[pill duplicada] antes-despues.headline empieza por la etiqueta: "${c.headline}"`)
  }
  // Los bullets compartidos tienen que ser IDÉNTICOS entre hero y cta-final.
  const hero = copy.find((c) => c.kind === 'hero')?.bullets ?? []
  const cta = copy.find((c) => c.kind === 'cta-final')?.bullets ?? []
  if (hero.length && cta.length && JSON.stringify(hero) !== JSON.stringify(cta.slice(0, hero.length)))
    fallos.push(`[bullets desincronizados] hero ${JSON.stringify(hero)} vs cta-final ${JSON.stringify(cta)}`)
  return fallos
}

async function main() {
  // La sesión se lee con su propio dueño: `getLandingSession` filtra por user_id.
  const { data: fila } = await createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).from('landing_sessions').select('user_id').eq('id', ID).single()
  const s = await getLandingSession(ID, (fila as { user_id: string } | null)?.user_id ?? null)
  if (!s) throw new Error(`No se encontró la sesión ${ID}`)
  const secciones = (s.sections?.map((x) => x.type) ?? Object.keys(SECTION_DNA)) as SectionType[]
  console.log(`Sesión ${ID} — ${s.product_name}`)
  console.log(`  público: ${s.audience}`)
  console.log(`  beneficios: ${s.benefits}`)
  console.log(`  secciones: ${secciones.join(', ')}\n`)

  const copy = await generateLandingCopy(s, secciones)

  for (const c of copy) {
    console.log(`── ${c.kind}`)
    if (c.kicker) console.log(`   kicker      (${c.kicker.length}) ${c.kicker}`)
    if (c.headline) console.log(`   headline    (${c.headline.length}) ${c.headline}`)
    if (c.subheadline) console.log(`   subheadline (${c.subheadline.length}) ${c.subheadline}`)
    for (const b of c.bullets ?? []) console.log(`   • ${b}`)
    for (const b of c.bulletsAfter ?? []) console.log(`   ▸ ${b}`)
    for (const t of c.cards ?? []) console.log(`   ▪ ${[t.title, t.body].filter(Boolean).join(' | ')}`)
    if (c.cta) console.log(`   cta         (${c.cta.length}) ${c.cta}`)
    if (c.closingStrip) console.log(`   franja      (${c.closingStrip.length}) ${c.closingStrip}`)
    console.log()
  }

  const fallos = revisar(secciones, copy)
  console.log(fallos.length ? `\n❌ ${fallos.length} defectos:\n${fallos.map((f) => '  ' + f).join('\n')}` : '\n✅ sin defectos de los que este probe sabe medir')
}

main().catch((e) => { console.error(e); process.exit(1) })
