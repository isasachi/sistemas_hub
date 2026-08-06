import { describe, it, expect } from 'vitest'
import { buildPrompt, buildBrandbookPrompt, STAGE_SEQUENCE, aspectFor } from '@/lib/branding/generation'
import type { Brief } from '@/lib/branding/brief'

const brief: Brief = {
  category: 'suplementos',
  productDescription: 'Creatina monohidratada micronizada en polvo',
  brandName: 'Creatim',
  tagline: 'Fuerza que se nota',
  audience: ['Hombres de 25 a 45', 'Deportistas'],
  feel: ['Potente', 'Técnico'],
  style: {
    palette: [
      { name: 'Naranja intenso', hex: '#FF4D00' },
      { name: 'Lima eléctrico', hex: '#C6FF00' },
      { name: 'Blanco puro', hex: '#FFFFFF' },
    ],
    inspiration: 'Swiss sports posters of the 1970s, anodised aluminium, athletics track markings',
    graphicStyle: 'Tight modular grid, oversized italic wordmark, flat two-colour iconography',
    products: 'Pote, Doypack, Shaker, Polo',
  },
}

describe('el prompt maestro', () => {
  const p = buildBrandbookPrompt(brief)

  it('arranca con la instrucción original y pide el board de un solo golpe', () => {
    expect(p.startsWith('Create a complete brand identity concept')).toBe(true)
    expect(p).toContain('single premium brand identity board')
    expect(p).toContain('Behance branding case study')
  })

  it('conserva los bloques fijos palabra por palabra', () => {
    expect(p).toContain('* Primary logo')
    expect(p).toContain('* Product and packaging mockups')
    expect(p).toContain('Editorial product photography, premium studio lighting, photorealistic')
    expect(p).toContain('Generic AI aesthetics, clipart, cartoon graphics')
    expect(p).toContain('plastic-looking materials unless intentionally specified')
  })

  it('rellena las 8 casillas con el brief', () => {
    expect(p).toContain('**Brand name:** Creatim')
    expect(p).toContain('**Tagline:** Fuerza que se nota')
    expect(p).toContain('**Brand description:** Creatina monohidratada')
    expect(p).toContain('**Target age group:** Hombres de 25 a 45, Deportistas')
    expect(p).toContain('**Brand feel:** bold, technical')
    expect(p).toContain('**Inspired from:** Swiss sports posters')
    expect(p).toContain('**Products and packaging:** Pote, Doypack, Shaker, Polo')
    expect(p).toContain('**Colors:** Naranja intenso #FF4D00, Lima eléctrico #C6FF00')
    expect(p).toContain('**Graphic style:** Tight modular grid')
  })

  it('el empaque va en español peruano y sin datos legales inventados', () => {
    expect(p).toContain('in Spanish as used in Peru')
    expect(p).toContain('CONT. NETO')
    expect(p).toContain('Do NOT invent legal or company data')
  })

  it('no fija tipografía: esa casilla no existe y el modelo elige', () => {
    expect(p).not.toMatch(/\*\*Typograph\w*:\*\*/)
    // La lista del sistema de identidad SÍ pide una sección de tipografía en el board.
    expect(p).toContain('* Typography')
  })

  // Una casilla vacía dejaba `**Inspired from:**` colgando, y el modelo dibuja
  // literalmente lo que no entiende.
  it('omite las casillas vacías en vez de mandarlas huecas', () => {
    const sin = buildBrandbookPrompt({ ...brief, tagline: undefined,
      style: { ...brief.style, inspiration: '', graphicStyle: '' } })
    expect(sin).not.toContain('Tagline')
    expect(sin).not.toContain('Inspired from')
    expect(sin).not.toContain('Graphic style')
    expect(sin).not.toMatch(/\n{3,}/)
    expect(sin).toContain('**Brand name:** Creatim')
  })
})

describe('las piezas sueltas', () => {
  it('salen DEL board, no de una interpretación nueva', () => {
    for (const stage of ['logo', 'empaque'] as const) {
      const p = buildPrompt(stage, brief)
      expect(p, stage).toContain('The attached image is the finished brand identity board')
      expect(p, stage).toContain('Do not redesign anything')
    }
  })

  it('el logo sale aislado y el empaque como foto de producto', () => {
    expect(buildPrompt('logo', brief)).toContain('isolated and centred on a plain white background')
    expect(buildPrompt('logo', brief)).toContain('no board layout')
    expect(buildPrompt('empaque', brief)).toContain('photorealistic product shot')
    expect(buildPrompt('empaque', brief)).toContain('Pote, Doypack, Shaker, Polo')
  })
})

describe('formato', () => {
  it('el board primero: las piezas lo necesitan generado', () => {
    expect(STAGE_SEQUENCE).toEqual(['brandbook', 'logo', 'empaque'])
  })

  it('board apaisado (el tamaño del board de referencia), logo cuadrado, empaque vertical', () => {
    expect(aspectFor('brandbook')).toBe('3:2')   // → 1536x1024
    expect(aspectFor('logo')).toBe('1:1')
    expect(aspectFor('empaque')).toBe('4:5')
  })
})
