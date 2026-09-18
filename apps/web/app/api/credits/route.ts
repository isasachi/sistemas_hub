import { NextResponse } from 'next/server'
import { currentCreditStatus } from '@/lib/credits'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Saldo de créditos del usuario de esta request. Solo LEE Supabase (regla de costo).
 *
 * Existe para el contador de la barra: vive en el layout de `(app)`, que el App Router NO
 * vuelve a renderizar al navegar entre `/dashboard` y `/tools/*` — verificado con dos rutas
 * de usar y tirar bajo un layout compartido (ver el comentario de `CreditosPill`): al navegar
 * con un `<Link>` se re-renderiza la página y no el layout. Sin esto el número se congelaba
 * en el del primer load y una sesión entera de generación se leía como "no me descuentan los
 * créditos" — reportado el 2026-09-18, con las filas de `ph_gen_usage` bien escritas y
 * `/cuenta` (fuera de ese layout) mostrando el saldo correcto.
 *
 * Sin sesión devuelve `{}` (no 401): la barra solo informa y no tiene nada que hacer con un
 * error — se queda con el último valor bueno.
 */
export async function GET() {
  const credits = await currentCreditStatus()
  if (!credits) return NextResponse.json({})
  return NextResponse.json({ restantes: credits.restantes, limite: credits.limite })
}
