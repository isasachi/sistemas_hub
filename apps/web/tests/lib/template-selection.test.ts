import { describe, it, expect } from 'vitest'
import { seedSelection, selectTemplate } from '@/lib/branding/template-selection'

describe('seedSelection', () => {
  it('sin selección previa: nada elegido, paleta en 0', () => {
    expect(seedSelection(null, 0)).toEqual({ picked: null, variant: 0 })
  })

  it('con plantilla y paleta guardadas: hidrata ambas (reabrir el paso no las pierde)', () => {
    expect(seedSelection('belleza/aceite-capilar', 2)).toEqual({ picked: 'belleza/aceite-capilar', variant: 2 })
  })

  it('plantilla guardada con paleta 1 (no 0): la hidratación no la pisa a 0', () => {
    expect(seedSelection('hogar/vela-aromatica', 1)).toEqual({ picked: 'hogar/vela-aromatica', variant: 1 })
  })
})

describe('selectTemplate', () => {
  it('elegir la MISMA plantilla ya elegida conserva la paleta actual', () => {
    const current = { picked: 'belleza/aceite-capilar', variant: 2 }
    expect(selectTemplate(current, 'belleza/aceite-capilar')).toEqual({ picked: 'belleza/aceite-capilar', variant: 2 })
  })

  it('elegir una plantilla DISTINTA resetea la paleta a 0', () => {
    const current = { picked: 'belleza/aceite-capilar', variant: 2 }
    expect(selectTemplate(current, 'hogar/vela-aromatica')).toEqual({ picked: 'hogar/vela-aromatica', variant: 0 })
  })

  it('primera elección (nada picked aún) arranca en la paleta 0', () => {
    const current = { picked: null, variant: 0 }
    expect(selectTemplate(current, 'belleza/aceite-capilar')).toEqual({ picked: 'belleza/aceite-capilar', variant: 0 })
  })
})

describe('seedSelection con referencia subida', () => {
  // Modo upload: no hay templateId, pero sí paletas (las 3 del análisis) y un
  // índice elegido. Sin esto, reabrir el paso 2 y re-confirmar pisaba la paleta a 0.
  it('sin plantilla pero con upload analizado: hidrata la paleta guardada', () => {
    expect(seedSelection(null, 2, true)).toEqual({ picked: null, variant: 2 })
  })

  it('sin plantilla y sin upload: la paleta no tiene contra qué indexar, 0', () => {
    expect(seedSelection(null, 2, false)).toEqual({ picked: null, variant: 0 })
  })
})
