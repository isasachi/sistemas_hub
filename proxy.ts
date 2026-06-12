import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Convención Next 16: el antiguo `middleware.ts` se renombró a `proxy.ts`.
// Refresca la sesión de Supabase y aplica el gating de rutas en cada request.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Corre en todas las rutas excepto:
     * - _next/static, _next/image (assets de build)
     * - favicon y archivos estáticos comunes
     * - /api/* (las rutas API hacen su propio chequeo de identidad)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
