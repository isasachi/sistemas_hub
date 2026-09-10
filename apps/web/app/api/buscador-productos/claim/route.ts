import { NextRequest, NextResponse } from 'next/server'
import {
  claimResumen, claimsDe, tomarProducto, cerrarClaim, PLANS, type Tier,
} from '@ph/shared'
import { getUser } from '@/lib/supabase/server'
import { getAccess } from '@/lib/whop'
import { cupoDe, type Encuesta } from '@/lib/product-hunter/flujo'
import { toEntry } from '@/lib/product-hunter/entry'

// Reclamos del flujo de un producto por vez.
//
//   POST { accion: 'tomar',  entryId, seed }              → lo saca del catálogo
//   POST { accion: 'cerrar', entryId, encuesta, comodin }
//   GET                                                   → cupo restante + su lista
//
// ⚠️ EL CUPO LO HACE CUMPLIR EL SERVIDOR, no la pantalla. El contador de la UI es
// informativo; lo que impide tomar el producto 6 con el plan 1 es este archivo.
// Un límite pintado en el cliente no es un límite — misma lección que el candado
// por rango del buscador.
//
// ⚠️ EXIGE SESIÓN DE VERDAD, no la cookie anónima de `readUserId`. El cupo cuelga
// del PLAN, y una identidad que se renueva borrando cookies daría cupo infinito.

async function identidad(): Promise<{ userId: string; tier: Tier } | null> {
  const user = await getUser().catch(() => null)
  if (!user) return null
  const tier = (await getAccess(user.id, user.email))?.tier ?? 1
  return { userId: user.id, tier }
}

async function estado(userId: string, tier: Tier) {
  const cupo = cupoDe(tier)
  const usado = await claimResumen(userId)
  return {
    tier,
    plan: PLANS[tier].nombre,
    cupo,
    usado,
    quedanProductos: Math.max(0, cupo.productos - usado.productos),
    quedanComodines: Math.max(0, cupo.comodines - usado.comodines),
  }
}

export async function GET() {
  const id = await identidad()
  if (!id) return NextResponse.json({ error: 'Necesitas iniciar sesión' }, { status: 401 })
  // La lista viaja con el estado porque el usuario TIENE que poder volver a un
  // producto que ya pagó con su cupo: si cierra la pestaña y no la tiene, gastó
  // el cupo en algo que no puede recuperar.
  const [e, filas] = await Promise.all([
    estado(id.userId, id.tier),
    claimsDe(id.userId),
  ])
  return NextResponse.json({ ...e, lista: filas.map(toEntry) })
}

export async function POST(req: NextRequest) {
  const id = await identidad()
  if (!id) return NextResponse.json({ error: 'Necesitas iniciar sesión' }, { status: 401 })

  let body: { accion?: string; entryId?: string; seed?: string; comodin?: boolean; encuesta?: Encuesta }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  const entryId = typeof body.entryId === 'string' ? body.entryId : ''
  if (!entryId) return NextResponse.json({ error: 'Falta el producto' }, { status: 400 })

  if (body.accion === 'tomar') {
    const antes = await estado(id.userId, id.tier)
    if (antes.quedanProductos <= 0) {
      return NextResponse.json({ error: 'Llegaste al límite de tu plan', ...antes }, { status: 409 })
    }
    const tomado = await tomarProducto(id.userId, entryId, body.seed ?? null)
    if (!tomado) {
      // Otro usuario lo reclamó entre que se le mostró y que le dio a abrir. NO
      // es un error: se le entrega otro, y por eso responde 409 con el estado.
      return NextResponse.json({ error: 'Ese producto lo acaba de tomar alguien más', yaTomado: true, ...antes }, { status: 409 })
    }
    return NextResponse.json(await estado(id.userId, id.tier))
  }

  if (body.accion === 'cerrar') {
    const comodin = body.comodin === true
    if (comodin) {
      const antes = await estado(id.userId, id.tier)
      // Sin cambios disponibles el producto se queda: es la regla del flujo.
      if (antes.quedanComodines <= 0) {
        return NextResponse.json({ error: 'Ya usaste todos tus cambios', ...antes }, { status: 409 })
      }
    }
    await cerrarClaim(
      id.userId, entryId,
      body.encuesta ?? { anuncios: null, unSoloProducto: null },
      comodin,
    )
    return NextResponse.json(await estado(id.userId, id.tier))
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
