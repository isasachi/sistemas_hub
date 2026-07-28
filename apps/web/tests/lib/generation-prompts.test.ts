import { describe, it, expect } from 'vitest'
import { referenceBlock, buildLabelPrompt, buildMockupPrompt } from '@/lib/branding/generation-prompts'
import type { BrandBrief } from '@/lib/branding/generation-prompts'
import type { BrandDna, ExtractedLayout } from '@/lib/branding/types'

const DNA: BrandDna = {
  essence: 'esencia', keywords: ['a'],
  palette: [
    { hex: '#FFFFFF', name: 'blanco', role: 'background' },
    { hex: '#111111', name: 'negro', role: 'primary' },
  ],
  typography: { primary: 'serif', secondary: 'sans', case: 'uppercase', detail: 'espaciado' },
  materials: ['vidrio'], composition: 'frasco centrado', lighting: 'difusa',
  mood: ['sereno'], motifs: ['filete'], avoid: ['neón'],
  styleBlock: 'Test packaging design language.',
}

const LAYOUT: ExtractedLayout = {
  anatomy: ['marca (~30%)', 'cuerpo (~50%)', 'datos (~20%)'],
  logoPlacement: 'centrado arriba', dataBlock: 'pie', margins: '8%',
  alignment: 'centered', avoidLayout: ['asimetría'],
}

const base: BrandBrief = {
  brandName: 'Lavíca', productName: 'Nama', productType: 'serum facial',
  containerType: 'frasco de vidrio con gotero', sameProduct: true,
}

describe('referenceBlock', () => {
  it('en la rama de clonado manda reproducir y limitar los cambios', () => {
    const s = referenceBlock({ ...base, sameProduct: true })
    expect(s).toMatch(/same product/i)
    expect(s).toMatch(/reproduce/i)
    expect(s).not.toMatch(/DIFFERENT product/i)
  })

  it('en la rama de traspaso nombra el producto del usuario y prohíbe copiar la silueta', () => {
    const s = referenceBlock({ ...base, sameProduct: false, productType: 'rodillera', referenceProductType: 'serum facial' })
    expect(s).toMatch(/DIFFERENT product/i)
    expect(s).toContain('rodillera')
    expect(s).toMatch(/do not copy the silhouette/i)
  })

  it('siempre pide un sello distintivo propio, en las dos ramas', () => {
    expect(referenceBlock({ ...base, sameProduct: true })).toMatch(/ONE distinctive signature/i)
    expect(referenceBlock({ ...base, sameProduct: false })).toMatch(/ONE distinctive signature/i)
  })
})

describe('los builders inyectan el bloque de referencia', () => {
  it('buildLabelPrompt lo incluye', () => {
    expect(buildLabelPrompt(base, DNA, LAYOUT)).toContain('ONE distinctive signature')
  })

  it('buildMockupPrompt lo incluye', () => {
    expect(buildMockupPrompt(base, DNA)).toContain('ONE distinctive signature')
  })

  it('buildLabelPrompt sigue anclando el wireframe como última imagen adjunta', () => {
    expect(buildLabelPrompt(base, DNA, LAYOUT)).toMatch(/FINAL attached image is a LAYOUT SKELETON/)
  })

  it('el microtexto legal se pide acorde al producto, no siempre ingredientes', () => {
    // La mitad del catálogo no es un envase: una caja de power bank no lleva
    // "ingredientes", lleva especificaciones.
    const p = buildLabelPrompt({ ...base, productType: 'power bank' }, DNA, LAYOUT)
    expect(p).toContain('power bank')
    expect(p).not.toMatch(/ingredient/i)
  })
})
