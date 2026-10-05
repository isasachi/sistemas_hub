// Reglas del loop de secciones de landing v2. Puro (sin I/O): lo usan el servidor, el agente y la UI.
import { SECTION_BY_ID, inSkeletonOrder, type SectionId } from './catalog'
import { UserError, type LandingSession } from './schemas'

export interface Support {
  ok: boolean
  /** Por qué no se puede generar sin inventar (español, para el usuario). */
  reason: string | null
  /** La sección compatible más cercana que se sugiere en su lugar. */
  suggest: SectionId | null
}

/** ¿Hay datos REALES que respalden la sección? Sin ellos no se genera: no se inventa contenido. */
export function sectionSupport(s: Pick<LandingSession, 'inputs' | 'testimonials'>, id: SectionId): Support {
  const spec = SECTION_BY_ID[id]
  if (spec.requires === 'testimonials' && s.testimonials.length === 0)
    return { ok: false, reason: 'La investigación no trae testimonios reales.', suggest: spec.fallback }
  if (spec.requires === 'proof_images' && !(s.inputs.proofImageUrls?.length))
    return { ok: false, reason: 'Hacen falta fotos reales de antes y después.', suggest: spec.fallback }
  return { ok: true, reason: null, suggest: null }
}

/** Siguiente sección seleccionada, respaldada y sin aprobar, en el orden del esqueleto. */
export function getNextSection(s: Pick<LandingSession, 'selected' | 'sections' | 'inputs' | 'testimonials'>): SectionId | null {
  return inSkeletonOrder(s.selected).find((id) => !s.sections[id]?.approved && sectionSupport(s, id).ok) ?? null
}

/** Marca aprobada la sección y avanza `current` a la siguiente. Devuelve la sesión nueva. */
export function approveSection(s: LandingSession, id: SectionId): LandingSession {
  const st = s.sections[id]
  if (!st?.versions.length) throw new UserError('No hay imagen que aprobar en esta sección.')
  const next: LandingSession = { ...s, sections: { ...s.sections, [id]: { ...st, approved: true } } }
  return { ...next, current: getNextSection(next) }
}
