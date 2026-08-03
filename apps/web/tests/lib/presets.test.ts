import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PRESETS, PRESET_IDS, presetsForCategory, getPreset } from '@/lib/branding/presets'

const EXPECTED_IDS = [
  'clinical_premium',
  'luxury_minimal',
  'botanical_apothecary',
  'soft_modern',
  'warm_editorial',
  'performance_dark',
  'heritage_craft',
]

const publicPath = (p: string) => path.join(process.cwd(), 'public', p)

describe('registro de presets', () => {
  it('son exactamente 7, con los ids del spec', () => {
    expect(PRESETS).toHaveLength(7)
    expect(new Set(PRESET_IDS)).toEqual(new Set(EXPECTED_IDS))
  })

  it('cada preset tiene 5 colores HEX, 2 tipografías y 5 rutas de moodboard', () => {
    for (const p of PRESETS) {
      const colors = Object.values(p.palette)
      expect(colors, p.id).toHaveLength(5)
      for (const c of colors) expect(c, `${p.id} ${c}`).toMatch(/^#[0-9A-F]{6}$/)
      expect(p.typography.display, p.id).toBeTruthy()
      expect(p.typography.body, p.id).toBeTruthy()
      expect(p.moodboard, p.id).toHaveLength(5)
      expect(p.label && p.signature && p.promptStyle, p.id).toBeTruthy()
      expect(p.affinity.length, p.id).toBeGreaterThan(0)
    }
  })

  it('la miniatura de cada preset existe en disco', () => {
    for (const p of PRESETS) {
      expect(fs.existsSync(publicPath(p.thumbnail)), `falta ${p.thumbnail}`).toBe(true)
    }
  })

  // Las 35 referencias de moodboard las provee el usuario (5 por preset). Hasta que
  // lleguen, este test queda rojo a propósito: es el recordatorio de que faltan assets.
  it('las 5 referencias de moodboard de cada preset existen en disco', () => {
    const missing = PRESETS.flatMap((p) => p.moodboard.filter((m) => !fs.existsSync(publicPath(m))))
    expect(missing, `faltan ${missing.length} refs de moodboard`).toEqual([])
  })

  it('botanical_apothecary no usa el crema de su foto (#EFE0C4)', () => {
    const colors = Object.values(getPreset('botanical_apothecary').palette).map((c) => c.toUpperCase())
    expect(colors).not.toContain('#EFE0C4')
  })
})

describe('orden de la grilla por afinidad', () => {
  it('mascotas pone soft_modern y heritage_craft en las dos primeras posiciones', () => {
    const ids = presetsForCategory('mascotas').map((p) => p.id)
    expect(new Set(ids.slice(0, 2))).toEqual(new Set(['soft_modern', 'heritage_craft']))
  })

  it('sin categoría devuelve los 7 en el orden del registro', () => {
    expect(presetsForCategory(null).map((p) => p.id)).toEqual(PRESET_IDS)
  })

  it('reordenar nunca pierde ni duplica presets', () => {
    for (const cat of ['suplementos', 'skincare', 'cabello', 'mascotas', 'bebida', 'otro'] as const) {
      const ids = presetsForCategory(cat).map((p) => p.id)
      expect(new Set(ids), cat).toEqual(new Set(PRESET_IDS))
      expect(ids, cat).toHaveLength(7)
    }
  })
})
