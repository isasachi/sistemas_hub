import { describe, it, expect } from 'vitest'
import { buildLogoInstruction, buildLabelInstruction } from '@/lib/branding/instructions'
import type { Direction, LabelData, DesignDna } from '@/lib/branding/types'

// Marcadores distintivos para detectar de dónde sale cada token en el prompt.
const BRAND_HEX = '#0A2540'
const BRAND_HEADLINE = 'BrandHeadlineFont'
const BRAND_BODY = 'BrandBodyFont'

const DIRECTION: Direction = {
  concept: 'concepto sobrio',
  rationale: 'rationale',
  palette: [
    { name: 'Azul marca', hex: BRAND_HEX, usage: 'principal' },
    { name: 'Crema', hex: '#F5F2EC', usage: 'fondo' },
    { name: 'Gris', hex: '#888888', usage: 'texto' },
  ],
  typography: { headline: BRAND_HEADLINE, body: BRAND_BODY, rationale: 'r' },
  logoDirection: 'logo limpio',
  summaryForUser: 'resumen',
  designSystem: {
    reference: 'EXEMPLAR_REF',
    logo: 'DS_LOGO_CONSTRUCTION',
    typography: 'DS_TYPOGRAPHY',
    spacing: 'DS_SPACING',
    components: 'DS_COMPONENTS_FURNITURE',
    layout: 'DS_LAYOUT_ZONES',
    personality: 'DS_PERSONALITY',
  },
}

// Ref con typography y palette distintivos del DNA — NO deben aparecer en el prompt con-ref.
const REF_DNA: DesignDna = {
  typography: 'REF_TYPOGRAPHY_DNA',
  palette: 'REF_PALETTE_DNA',
  spacing: 'REF_SPACING_DNA',
  repetition: 'REF_REPETITION_DNA',
  components: 'REF_COMPONENTS_DNA',
  layout: 'REF_LAYOUT_DNA',
  personality: 'REF_PERSONALITY_DNA',
  logoDesc: 'REF_LOGODESC_DNA',
}

const LABEL_DATA: LabelData = {
  packagingFormat: 'frasco de vidrio',
  ingredients: 'agua, sal',
  netWeight: '100 g',
  units: '1 unidad',
  highlight: 'sabor original',
}

describe('branding instructions — design system aislado y override de marca', () => {
  describe('CON ref: ref = estructura, marca = color/tipo; design system NO entra', () => {
    it('logo con ref usa paleta/tipografía de marca, no las del ref ni el design system', () => {
      const p = buildLogoInstruction(DIRECTION, 'MiMarca', 'variant', true, REF_DNA)
      // marca presente
      expect(p).toContain(BRAND_HEX)
      expect(p).toContain(BRAND_HEADLINE)
      expect(p).toContain(BRAND_BODY)
      // typography/palette del ref ausentes
      expect(p).not.toContain('REF_TYPOGRAPHY_DNA')
      expect(p).not.toContain('REF_PALETTE_DNA')
      // design system curado ausente
      expect(p).not.toContain('proven design system')
      expect(p).not.toContain('DS_LOGO_CONSTRUCTION')
    })

    it('etiqueta con ref usa paleta/tipografía de marca, no las del ref ni el design system', () => {
      const p = buildLabelInstruction(DIRECTION, 'MiMarca', 'Producto', LABEL_DATA, true, REF_DNA)
      // marca presente
      expect(p).toContain(BRAND_HEX)
      expect(p).toContain(BRAND_HEADLINE)
      expect(p).toContain(BRAND_BODY)
      // typography/palette del ref ausentes (la violación que arreglamos)
      expect(p).not.toContain('REF_TYPOGRAPHY_DNA')
      expect(p).not.toContain('REF_PALETTE_DNA')
      // estructura del ref SÍ presente (se disecciona todo menos color/tipo)
      expect(p).toContain('REF_COMPONENTS_DNA')
      expect(p).toContain('REF_LAYOUT_DNA')
      // design system curado ausente
      expect(p).not.toContain('proven design system')
    })
  })

  describe('SIN ref: design system aislado por artefacto', () => {
    it('logo sin ref usa solo lógica de logo del design system (sin layout ni components)', () => {
      const p = buildLogoInstruction(DIRECTION, 'MiMarca', 'variant', false, null)
      expect(p).toContain('proven design system')
      expect(p).toContain('DS_LOGO_CONSTRUCTION')
      expect(p).toContain('DS_TYPOGRAPHY')
      expect(p).toContain('DS_PERSONALITY')
      // furniture/zonas de etiqueta NO entran al logo
      expect(p).not.toContain('DS_LAYOUT_ZONES')
      expect(p).not.toContain('DS_COMPONENTS_FURNITURE')
    })

    it('etiqueta sin ref usa lógica de etiqueta del design system (sin construcción de logo)', () => {
      const p = buildLabelInstruction(DIRECTION, 'MiMarca', 'Producto', LABEL_DATA, false, null)
      expect(p).toContain('proven design system')
      expect(p).toContain('DS_TYPOGRAPHY')
      expect(p).toContain('DS_COMPONENTS_FURNITURE')
      expect(p).toContain('DS_PERSONALITY')
      // la construcción de logo NO entra a la etiqueta
      expect(p).not.toContain('DS_LOGO_CONSTRUCTION')
      // layout nunca entra (lo da la arquitectura)
      expect(p).not.toContain('DS_LAYOUT_ZONES')
    })
  })
})
