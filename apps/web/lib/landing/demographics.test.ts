import { describe, it, expect } from 'vitest'
import { DemographicId } from './types'
import { DEMOGRAPHIC_POSES, DEMOGRAPHIC_PERSONA, assignPoses } from './demographics'

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
