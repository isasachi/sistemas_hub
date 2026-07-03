import { describe, it, expect } from 'vitest'
import { buildSectionInstruction } from '@/lib/landing/instructions'
import type { SectionCopy } from '@/lib/landing/types'

const COPY: SectionCopy = { type: 'hero', headline: 'Titular', subheadline: 'Sub' }
const BRAND_HEX = '#0A2540'
const TYPO = { headline: 'bold condensed sans', body: 'clean humanist sans' }

describe('buildSectionInstruction', () => {
  it('inyecta layout + design system y reparte la paleta/tipografía de marca sobre los roles', () => {
    const out = buildSectionInstruction(COPY, 'source', [{ name: 'Azul', hex: BRAND_HEX, usage: 'principal' }], TYPO)
    // Esqueleto (qué/dónde).
    expect(out).toContain('MASTER LAYOUT')
    // Capa de craft que de-generaliza (cómo se renderiza).
    expect(out).toContain('DESIGN SYSTEM')
    // Paleta de marca repartida sobre los roles (un acento).
    expect(out).toContain(BRAND_HEX)
    expect(out).toContain('dominant brand accent')
    // Tipografía de marca inyectada.
    expect(out).toContain('bold condensed sans')
    // Disciplina de texto reforzada (evita la fuga de vocabulario del design system).
    expect(out).toContain('TEXT DISCIPLINE')
  })

  it('estilo gráfico de marca (handoff) se inyecta cuando se provee', () => {
    const out = buildSectionInstruction(COPY, 'source', null, null, 'minimal premium skincare, soft botanical motifs')
    expect(out).toContain('Brand identity')
    expect(out).toContain('soft botanical motifs')
  })

  it('sin marca igual inyecta layout + design system', () => {
    const out = buildSectionInstruction(COPY, 'source')
    expect(out).toContain('MASTER LAYOUT')
    expect(out).toContain('DESIGN SYSTEM')
    expect(out).not.toContain('build everything from these brand colors')
  })

  it('modo source reproduce TODOS los labels reales; anchored calca un recorte del producto sin layout', () => {
    const source = buildSectionInstruction(COPY, 'source')
    const anchored = buildSectionInstruction(COPY, 'anchored')
    // source parte de la foto real y preserva todos los labels (fidelidad), sin inventar.
    expect(source).toContain('REAL product')
    expect(source).toContain('every secondary label')
    expect(source).toContain('Invent NOTHING')
    // anchored: Imagen 1 es un recorte aislado del producto (consistencia SIN clonar el layout).
    expect(anchored).toContain('ISOLATED CROP')
    expect(anchored).toContain('do NOT copy any framing, background or composition')
    expect(anchored).toContain('ground-truth')
    expect(anchored).not.toBe(source)
  })

  it('el texto de etiquetas se inyecta como ground-truth solo cuando se provee', () => {
    const labels = 'EÚNOIA\nNiacinamida · Pantenol · Colágeno\n30ml / 1.85 fl oz'
    const withLabels = buildSectionInstruction(COPY, 'source', null, null, null, labels)
    const without = buildSectionInstruction(COPY, 'source', null, null, null, null)
    expect(withLabels).toContain('PRODUCT LABEL TEXT (authoritative ground-truth)')
    expect(withLabels).toContain('Niacinamida · Pantenol · Colágeno')
    expect(without).not.toContain('PRODUCT LABEL TEXT')
    // vacío/whitespace no inyecta.
    expect(buildSectionInstruction(COPY, 'source', null, null, null, '  ')).not.toContain('PRODUCT LABEL TEXT')
    // también aplica en anchored, no en none.
    expect(buildSectionInstruction(COPY, 'anchored', null, null, null, labels)).toContain('PRODUCT LABEL TEXT')
    expect(buildSectionInstruction(COPY, 'none', null, null, null, labels)).not.toContain('PRODUCT LABEL TEXT')
  })
})
