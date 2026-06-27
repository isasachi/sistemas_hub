import { describe, it, expect } from 'vitest'
import { regenButtonState } from '../../lib/regen-button-state'

describe('regenButtonState', () => {
  it('imagen con regens disponibles: habilitado, con contador, sin motivo', () => {
    expect(regenButtonState(3, false)).toEqual({ disabled: false, showCounter: true, reason: null })
  })
  it('regensLeft 0: deshabilitado con motivo', () => {
    const s = regenButtonState(0, false)
    expect(s.disabled).toBe(true)
    expect(s.showCounter).toBe(true)
    expect(s.reason).toBeTruthy()
  })
  it('busy deshabilita aunque queden regens', () => {
    expect(regenButtonState(2, true).disabled).toBe(true)
  })
  it('copy (null): sin contador, habilitado, sin motivo', () => {
    expect(regenButtonState(null, false)).toEqual({ disabled: false, showCounter: false, reason: null })
  })
})
