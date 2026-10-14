// Cuota y créditos de landing v2: los del hub (`lib/gen-quota.ts` + `lib/credits.ts`).
//
// - Render y revisión de sección: kind `landing-section:v2-<id>`. El prefijo `landing-section`
//   cobra 1 crédito por imagen y aplica `GEN_PER_STEP_LIMIT` (1 gen + 3 cambios por sección).
// - Turno del chat: `landing-v2-chat` (cuota diaria, sin crédito). Sin esto el chat sería un
//   endpoint gratis de LLM.
//
// El `owner` se resuelve ANTES de abrir el stream del chat y se pasa: dentro del stream las cookies
// de la request ya no son confiables (mismo motivo que el stream de branding, ver `CreditOwner`).
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import type { CreditOwner } from '@/lib/credits'
import type { SectionId } from './catalog'

export interface Ctx {
  userId: string
  owner: CreditOwner | null
}

export const sectionKind = (id: SectionId) => `landing-section:v2-${id}`
export const CHAT_KIND = 'landing-v2-chat'

export class QuotaError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** Gate antes de gastar. Lanza `QuotaError` con el mensaje en español de `gen-quota`. */
export async function gate(sessionId: string, kind: string, ctx: Ctx): Promise<void> {
  const { blocked } = await checkGenQuota(sessionId, kind, ctx.owner)
  if (!blocked) return
  const body = await blocked.json().catch(() => ({})) as { error?: string }
  throw new QuotaError(body.error ?? 'Llegaste al límite de generaciones.', blocked.status)
}

export const record = (sessionId: string, kind: string, ctx: Ctx) => recordGenQuota(sessionId, kind, ctx.userId)
