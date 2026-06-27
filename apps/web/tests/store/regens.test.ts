import { describe, it, expect, beforeEach } from 'vitest'
import { useBrandingStore } from '../../store/branding'

describe('branding store: regens', () => {
  beforeEach(() => { useBrandingStore.setState({ regens: {} }) })

  it('setRegens puebla el mapa completo', () => {
    useBrandingStore.getState().setRegens({ 'branding-logo': 3, 'branding-label': 1 })
    expect(useBrandingStore.getState().regens).toEqual({ 'branding-logo': 3, 'branding-label': 1 })
  })

  it('setRegen actualiza solo ese kind, conserva el resto', () => {
    useBrandingStore.getState().setRegens({ 'branding-logo': 3, 'branding-label': 2 })
    useBrandingStore.getState().setRegen('branding-logo', 1)
    expect(useBrandingStore.getState().regens).toEqual({ 'branding-logo': 1, 'branding-label': 2 })
  })
})
