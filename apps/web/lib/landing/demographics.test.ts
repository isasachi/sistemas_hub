import { describe, it, expect } from 'vitest'
import { DemographicId, BodyFocus, type SectionType } from './types'
import {
  DEMOGRAPHIC_POSES, DEMOGRAPHIC_PERSONA, assignPoses,
  ZONE_POSES, BODY_FOCUS_LABELS, BODY_FOCUS_FRAMING, zoneNeedsOwnPlate,
} from './demographics'

describe('Anexo B — poses y persona', () => {
  it('cada demografía con talento tiene ≥8 poses únicas; no_talent = 0', () => {
    for (const d of DemographicId.options) {
      const poses = DEMOGRAPHIC_POSES[d]
      if (d === 'no_talent') { expect(poses).toEqual([]); continue }
      expect(poses.length, d).toBeGreaterThanOrEqual(8)
      expect(new Set(poses).size, d).toBe(poses.length) // sin repetición
      expect(DEMOGRAPHIC_PERSONA[d], d).toBeTruthy()
    }
  })
  it('assignPoses da una pose ÚNICA por sección, determinista', () => {
    const order = ['hero', 'beneficios', 'oferta', 'testimonios', 'garantia', 'cta-final'] as const
    const a = assignPoses([...order], 'female_18_30')
    const b = assignPoses([...order], 'female_18_30')
    expect(a).toEqual(b) // determinista
    const vals = Object.values(a)
    expect(new Set(vals).size).toBe(vals.length) // únicas (QA#6)
    expect(a['cta-final']).toContain('envase') // pose reservada sosteniendo el producto
  })
  it('no_talent devuelve poses vacías (el carril usa el sustituto por nicho)', () => {
    expect(assignPoses(['hero'], 'no_talent')).toEqual({ hero: '' })
  })
})

// ─── Zona del cuerpo (2026-08-15) ───────────────────────────────────────────
// El bug que esto arregla: las poses salían SOLO de la demografía, y los seis bancos están
// encuadrados en el rostro. Una rodillera recibía un retrato; una creatina de glúteos, también.
describe('assignPoses con body_focus', () => {
  const ORDEN: SectionType[] = ['hero', 'beneficios', 'oferta', 'antes-despues']

  it('sin zona (o con rostro/cabello) sale IDÉNTICO a antes — todo del banco demográfico', () => {
    const base = assignPoses(ORDEN, 'female_18_30')
    expect(assignPoses(ORDEN, 'female_18_30', null)).toEqual(base)
    expect(assignPoses(ORDEN, 'female_18_30', 'rostro')).toEqual(base)
    expect(assignPoses(ORDEN, 'female_18_30', 'cabello')).toEqual(base)
    for (const pose of Object.values(base)) {
      expect(DEMOGRAPHIC_POSES.female_18_30).toContain(pose)
    }
  })

  // La regla del reparto: la cara abre la landing, la zona la sostiene.
  it('el hero conserva la pose demográfica y el resto toma la de la zona', () => {
    const p = assignPoses(ORDEN, 'female_18_30', 'gluteos_piernas')
    expect(DEMOGRAPHIC_POSES.female_18_30).toContain(p.hero)
    for (const s of ['beneficios', 'oferta', 'antes-despues'] as SectionType[]) {
      expect(ZONE_POSES.gluteos_piernas).toContain(p[s])
      expect(DEMOGRAPHIC_POSES.female_18_30).not.toContain(p[s])
    }
  })

  it('ninguna sección de zona repite pose mientras el banco alcance (QA#6)', () => {
    const p = assignPoses(ORDEN, 'female_18_30', 'rodilla')
    const zonales = (['beneficios', 'oferta', 'antes-despues'] as SectionType[]).map((s) => p[s])
    expect(new Set(zonales).size).toBe(zonales.length)
  })

  // El banco de zona es de ENCUADRE: si una pose nombrara la cara, el producto se vería en una
  // sección y la cara en la otra, que es exactamente el defecto original.
  it('ninguna pose de zona (fuera de cuerpo_completo) menciona el rostro', () => {
    for (const [zona, poses] of Object.entries(ZONE_POSES)) {
      if (zona === 'cuerpo_completo') continue
      for (const pose of poses) {
        expect(pose.toLowerCase()).not.toMatch(/\bsonrisa|mirada a cámara|mejilla|mentón\b/)
      }
    }
  })

  it('la demografía sin talento sigue devolviendo poses vacías, con zona o sin ella', () => {
    expect(assignPoses(ORDEN, 'no_talent', 'rodilla')).toEqual({
      hero: '', beneficios: '', oferta: '', 'antes-despues': '',
    })
  })

  it('zoneNeedsOwnPlate: solo las zonas con banco propio piden una segunda placa', () => {
    expect(zoneNeedsOwnPlate('rostro')).toBe(false)
    expect(zoneNeedsOwnPlate('cabello')).toBe(false)
    expect(zoneNeedsOwnPlate(null)).toBe(false)
    expect(zoneNeedsOwnPlate('rodilla')).toBe(true)
    expect(zoneNeedsOwnPlate('gluteos_piernas')).toBe(true)
  })

  it('cada zona tiene etiqueta de UI y texto de encuadre — el selector y la placa los leen', () => {
    for (const f of BodyFocus.options) {
      expect(BODY_FOCUS_LABELS[f]).toBeTruthy()
      expect(BODY_FOCUS_FRAMING[f]).toBeTruthy()
    }
  })
})
