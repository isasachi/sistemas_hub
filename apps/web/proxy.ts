import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Convención Next 16: el antiguo `middleware.ts` se renombró a `proxy.ts`.
// Refresca la sesión de Supabase y aplica el gating de rutas en cada request.
export async function proxy(request: NextRequest) {
  // Bypass temporal: AUTH_DISABLED=true abre /dashboard y /tools/* sin login
  // (demo). No crea el cliente Supabase, así que tampoco depende de la anon key.
  if (process.env.AUTH_DISABLED === 'true') return NextResponse.next()
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Corre en todas las rutas excepto:
     * - _next/static, _next/image (assets de build)
     * - favicon y archivos estáticos comunes
     * - /api/* (no pasan por el gate de auth; las rutas que llaman Gemini se
     *   protegen con checkGenQuota/recordGenQuota — per-step + backstop global,
     *   ver lib/gen-quota.ts)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
