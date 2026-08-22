// Recrawl adaptativo (spec §9). La frecuencia con la que se vuelve a mirar a un
// anunciante es proporcional a su tasa de cambio observada.
//
// ⚠️ ESTO ES LO QUE HACE QUE "LOS VIEJOS SALGAN" SIN UN JOB DE LIMPIEZA. Un
// anunciante sin anuncios dos pasadas seguidas cae a cuarentena y después a
// `archived`, que sale del inventario activo conservando el histórico. Un job de
// borrado aparte tendría que re-decidir lo mismo con menos información.

export type CrawlTier = 'hot' | 'warm' | 'cold' | 'quarantine' | 'archived'

/** Cada cuánto vuelve a mirarse un anunciante de este tier. */
export const TIER_HORAS: Record<Exclude<CrawlTier, 'archived'>, number> = {
  hot: 24,
  warm: 72,
  cold: 168,
  quarantine: 336,
}

export interface EstadoAnunciante {
  tier: CrawlTier
  /** Anuncios que tenía la última vez. null = nunca se midió. */
  adCountPrevio: number | null
  consecutiveMisses: number
}

export interface ResultadoAuditoria {
  /** Anuncios activos ahora. */
  activeAds: number
  /** Share del producto dominante (Regla 3). */
  monoRatio: number
}

export interface Transicion {
  tier: CrawlTier
  consecutiveMisses: number
}

/**
 * Siguiente tier de un anunciante después de auditarlo.
 *
 * ⚠️ `activeAds === 0` NO ES "no tiene anuncios" SI LA LECTURA FUE INCONCLUSA.
 * Esta función asume que le llega una auditoría REAL — una lectura bloqueada de
 * Meta devuelve un payload sin nodos y ya está acotada aguas arriba
 * (`profileAdvertiser` devuelve null). Llamar acá con un cero fabricado manda a
 * cuarentena a un anunciante sano, que es el mismo modo de fallo que dejó 19
 * perfiles en ceros. Si la auditoría no concluyó, NO se llama a esta función.
 */
export function nextTier(adv: EstadoAnunciante, res: ResultadoAuditoria): Transicion {
  if (res.activeAds === 0) {
    const misses = adv.consecutiveMisses + 1
    if (misses >= 2) {
      return { tier: adv.tier === 'quarantine' ? 'archived' : 'quarantine', consecutiveMisses: misses }
    }
    return { tier: 'cold', consecutiveMisses: misses }
  }

  const delta = res.activeAds - (adv.adCountPrevio ?? 0)

  // Sumando anuncios Y monoproducto: es la señal más fuerte que existe acá, y se
  // mira todos los días.
  if (delta > 0 && res.monoRatio >= 0.6) return { tier: 'hot', consecutiveMisses: 0 }
  if (delta > 0) return { tier: 'warm', consecutiveMisses: 0 }
  // Quieto: un `hot` baja un escalón en vez de caer hasta cold, así no se pierde
  // de vista al que venía creciendo por una sola pasada plana.
  if (delta === 0) return { tier: adv.tier === 'hot' ? 'warm' : 'cold', consecutiveMisses: 0 }
  // Perdiendo anuncios.
  return { tier: 'cold', consecutiveMisses: 0 }
}

/** ¿Le toca? Se usa para decidir sin ir a la base cuando el dato ya está en mano. */
export function venció(tier: CrawlTier, lastAuditedAt: string | null, ahora = Date.now()): boolean {
  if (tier === 'archived') return false
  if (!lastAuditedAt) return true
  const horas = (ahora - new Date(lastAuditedAt).getTime()) / 3_600_000
  return horas >= TIER_HORAS[tier]
}
