import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { currentCreditStatus } from '@/lib/credits'
import { ProductScanSchema, type AdVariant } from '@/lib/types'
import { getTemplate, slotsDelModelo } from '@/lib/anuncios/templates'
import { STEP } from '@/lib/anuncios/steps'
import {
  PlanLoteSchema, CopyVarianteSchema, buildPlanPrompt, buildCopyPrompt,
  slotsLargos, correccionDeSlots, conceptosDuplicados,
  type ContextoLote, type PlanVariante,
} from '@/lib/anuncios/lote'
import { anunciosPosibles } from '@ph/shared'

export const maxDuration = 300

/**
 * PLANIFICAR EL LOTE — el Creative Batch Planner del spec (§16), más la redacción de cada
 * variante (§10).
 *
 * ⚠️ ES TEXTO, ASÍ QUE NO GASTA CRÉDITOS. Los créditos se gastan en `render-lote`, y esa
 * separación es deliberada: el usuario revisa los N conceptos y su copy ANTES de que se genere
 * una sola imagen, y volver a planificar es gratis. Con la planificación cobrada, un lote que no
 * convence costaría lo mismo que uno bueno.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'anuncios-plan')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getSession(id, userId)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  const template = getTemplate(session.template_id)
  if (!template)
    return NextResponse.json({ error: 'Esta sesión no tiene plantilla' }, { status: 409 })
  if (!session.product_scan || !session.product_name || !session.what_it_does || !session.target_audience)
    return NextResponse.json({ error: 'Completa los pasos anteriores primero' }, { status: 409 })

  let body: { comments?: unknown; n?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  const comments = typeof body.comments === 'string' ? body.comments.trim() : ''
  if (!comments) return NextResponse.json({ error: 'Faltan los comentarios' }, { status: 400 })
  if (comments.length > 8000)
    return NextResponse.json({ error: 'Los comentarios pasan de 8000 caracteres' }, { status: 400 })

  // ⚠️ EL CAP LO DECIDE EL SERVIDOR, y con los DOS topes: el del plan (lo que compró) y los
  // créditos que le quedan (lo que puede pagar). Un cliente que mande n=50 recibe el cap de su
  // plan, no un error — y uno que mande 10 con 4 créditos recibe 4, para que el lote no arranque
  // condenado a morir a mitad con parte de los créditos ya gastados.
  const credits = await currentCreditStatus()
  const pedido = Math.max(1, Math.floor(Number(body.n) || 1))
  const maximo = credits ? anunciosPosibles(credits.tier, credits.restantes) : 1
  if (maximo <= 0)
    return NextResponse.json(
      { error: 'No te quedan créditos de imagen este período.', credits },
      { status: 429 }
    )
  const n = Math.min(pedido, maximo)

  try {
    const scan = ProductScanSchema.parse(session.product_scan)
    const ctx: ContextoLote = {
      template,
      productName: session.product_name,
      whatItIs: session.what_it_is,
      whatItDoes: session.what_it_does,
      targetAudience: session.target_audience,
      brandingDescription: scan.brandingDescription ?? null,
      productDescription: scan.productDescription,
      comments,
    }

    // ── 1. El plan: UNA llamada que ve las N variantes juntas ──────────────────
    // Ver el lote entero es el mecanismo que impide la variación superficial, no una
    // optimización. N llamadas sueltas de "genera otro anuncio diferente" devuelven N formas de
    // decir lo mismo — el propio spec lo ejemplifica y este repo ya lo midió con A/B.
    const plan = await callStructured('plan_lote', PlanLoteSchema, [{ text: buildPlanPrompt(ctx, n) }], 3, undefined, { preferGemini: true })
    const planeadas = plan.variantes.slice(0, n)

    // ── 2. El copy: una llamada POR variante, en paralelo ─────────────────────
    // Aislada a propósito (§29): el escritor se concentra en una, y una que falle no tumba el
    // lote. `Promise.allSettled` y no `all` justamente por eso.
    const escritas = await Promise.allSettled(planeadas.map((v) => escribirVariante(ctx, v)))

    const variants: AdVariant[] = []
    escritas.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[plan-lote] ${id}: la variante ${i + 1} no se pudo redactar`, r.reason)
        return
      }
      // ⚠️ UNA VARIANTE SIN TEXTO NO SE GUARDA, y este guard vale un crédito. `escribirVariante`
      // descarta los slots que la plantilla no declara, así que un modelo que devuelva ids
      // inventados deja el array VACÍO — y una variante vacía se persiste como `planificada`, se
      // muestra como una tarjeta sin copy y después se RENDERIZA: un crédito gastado en un
      // anuncio sin una palabra. Se descarta acá, igual que una que falló al redactarse.
      if (r.value.length === 0) {
        console.warn(`[plan-lote] ${id}: la variante ${i + 1} volvió sin ningún hueco válido`)
        return
      }
      variants.push({
        id: `v${variants.length + 1}`,
        concepto: planeadas[i].concepto,
        angulo: planeadas[i].angulo,
        slots: r.value,
        estado: 'planificada',
        imageUrl: null,
        error: null,
      })
    })

    if (variants.length === 0)
      return NextResponse.json({ error: 'No se pudo redactar ninguna variante. Inténtalo de nuevo.' }, { status: 502 })

    // ponytail: solo se REPORTA. El usuario tiene los conceptos delante y todavía no gastó una
    // imagen, así que la salida barata es que vuelva a planificar (es gratis). Si se mide que se
    // dispara seguido, el upgrade es reemplazar solo los duplicados.
    const duplicados = conceptosDuplicados(variants)
    if (duplicados.length)
      console.warn(`[plan-lote] ${id}: conceptos parecidos entre sí — ${JSON.stringify(duplicados)}`)

    await updateSession(id, { step: STEP.CONCEPTOS, tiktok_comments: comments, variants })
    // ponytail: UNA fila por planificación, no una por llamada de texto. Las N+1 llamadas son de
    // texto barato; lo que se cuenta fila por fila son las imágenes, que es donde está el costo.
    await recordGenQuota(id, 'anuncios-plan', userId)

    return NextResponse.json({
      variants,
      duplicados: duplicados.map(([a, b]) => [variants[a]?.id, variants[b]?.id]),
      // Lo que el cliente pidió contra lo que se sirvió: si el cap recortó, la UI tiene que poder
      // decirlo en vez de mostrar en silencio menos anuncios de los que el usuario eligió.
      pedido,
      servido: variants.length,
      maximo,
      credits,
    })
  } catch (err) {
    console.error('[plan-lote]', err)
    return NextResponse.json({ error: 'No se pudo planificar el lote. Inténtalo de nuevo.' }, { status: 500 })
  }
}

/**
 * El copy de UNA variante, con la validación de layout de §12.
 *
 * ⚠️ EL TOPE DE PALABRAS SE VERIFICA DESPUÉS Y SE CORRIGE PIDIENDO DE NUEVO, nunca recortando ni
 * poniéndolo como `maxLength` del schema: medido en landing, OpenAI aplica ese tope al decodificar
 * y devuelve la frase CORTADA a la mitad. Un reintento CIEGO tampoco sirve —devuelve lo mismo—,
 * así que la segunda llamada nombra los huecos que se pasaron.
 *
 * Un solo reintento: si sigue largo se conserva el texto. Un titular una palabra más largo se lee;
 * uno truncado, no.
 */
async function escribirVariante(ctx: ContextoLote, v: PlanVariante) {
  const defs = slotsDelModelo(ctx.template)
  const pedir = (correccion?: string) =>
    callStructured('copy_variante', CopyVarianteSchema, [{ text: buildCopyPrompt(ctx, v, correccion) }], 3, undefined, { preferGemini: true })

  let copy = await pedir()
  const largos = slotsLargos(copy.slots, defs)
  if (largos.length) {
    try {
      copy = await pedir(correccionDeSlots(largos, defs))
    } catch {
      /* el reintento es una mejora, no un requisito: se conserva el primer intento */
    }
  }
  // Solo los huecos que la plantilla declara: un slot inventado por el modelo no se dibuja en
  // ninguna parte y solo ensucia el prompt del render.
  const validos = new Set(defs.map((d) => d.id))
  return copy.slots.filter((s) => validos.has(s.slot))
}
