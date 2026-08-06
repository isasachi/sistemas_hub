import { describe, it, expect } from 'vitest'
import { buildPrompt, buildIdentityPrompt, STAGE_SEQUENCE, aspectFor, type Stage } from '@/lib/branding/generation'
import type { Brief } from '@/lib/branding/brief'

const brief: Brief = {
  category: 'suplementos',
  productDescription: 'Una marca de creatina en polvo',
  brandName: 'Creatim',
  audience: ['Hombres de 25 a 45'],
  feel: ['Potente', 'Juvenil'],
  style: {
    palette: ['naranja intenso', 'amarillo suave', 'blanco puro', 'lima eléctrico'],
    inspiration: 'Editorial product photography',
  },
}

describe('el prompt maestro', () => {
  const p = buildIdentityPrompt(brief)

  it('arranca con la instrucción del usuario y pide las 3 piezas', () => {
    expect(p.startsWith('Create a complete visual identity for the brand below.')).toBe(true)
    expect(p).toContain('* Primary logo and logo variations')
    expect(p).toContain('* Product label design')
    expect(p).toContain('* Realistic product mockup')
  })

  it('conserva Style y Avoid palabra por palabra', () => {
    expect(p).toContain('Style: Premium, modern, minimalist, editorial product photography, clean layout, photorealistic.')
    expect(p).toContain('Avoid: Generic AI aesthetics, clipart, cartoon graphics')
    expect(p).toContain('watermarks, and inconsistent branding.')
  })

  it('rellena las 6 casillas', () => {
    expect(p).toContain('**Brand name:** Creatim')
    expect(p).toContain('**Brand description:** Una marca de creatina en polvo')
    expect(p).toContain('**Target audience:** Hombres de 25 a 45')
    expect(p).toContain('**Brand feel:** bold, youthful')
    expect(p).toContain('**Inspired from:** Editorial product photography')
    expect(p).toContain('**Colors:** naranja intenso, amarillo suave, blanco puro, lima eléctrico')
  })

  // El hallazgo que costó un rediseño: con hex el modelo tiene que acomodarlos y
  // el board sale peor. Los nombres lo dejan elegir valores que funcionan juntos.
  it('los colores van por NOMBRE, nunca por hex', () => {
    expect(p).not.toMatch(/#[0-9A-Fa-f]{6}/)
  })

  it('no inventa casillas que el prompt no tiene', () => {
    for (const ausente of ['Graphic style', 'Products and packaging', 'Typography']) {
      expect(p, ausente).not.toContain(`**${ausente}:**`)
    }
  })

  it('mantiene idioma y datos legales en UNA línea', () => {
    expect(p).toContain('Packaging copy in Spanish (Peru)')
    expect(p).toContain('Do not invent company names, addresses or registration numbers')
    // El bloque largo anterior era parte de lo que densificaba el board.
    expect(p.split('\n').find((l) => l.startsWith('Packaging copy'))!.length).toBeLessThan(120)
  })

  // Un `**Inspired from:**` colgando sin valor es ruido que el modelo dibuja.
  it('omite las casillas vacías', () => {
    const sin = buildIdentityPrompt({ ...brief, style: { palette: [], inspiration: '' } })
    expect(sin).not.toContain('Inspired from')
    expect(sin).not.toContain('Colors')
    expect(sin).not.toMatch(/\n{3,}/)
    expect(sin).toContain('**Brand name:** Creatim')
  })

  it('sigue siendo corto: es la premisa del rediseño', () => {
    expect(p.split(/\s+/).length).toBeLessThan(140)
  })
})

describe('las piezas sueltas', () => {
  const PIEZAS: Exclude<Stage, 'identidad'>[] = ['logo', 'etiqueta', 'mockup']

  it('salen DE la identidad, no de una lectura nueva', () => {
    for (const stage of PIEZAS) {
      const p = buildPrompt(stage, brief)
      expect(p, stage).toContain('The attached image is the finished visual identity')
      // Cada pieza lo dice a su manera, pero ninguna puede quedar sin la orden de
      // no reinventar: es lo único que las mantiene siendo la misma marca.
      expect(p, stage).toMatch(/do not invent|Do not restyle/i)
    }
  })

  it('el logo sale aislado sobre blanco', () => {
    const p = buildPrompt('logo', brief)
    expect(p).toContain('isolated and centred on a plain white background')
    expect(p).toContain('no board layout')
  })

  it('la etiqueta es un 360 plano de dos paneles, no un envase', () => {
    const p = buildPrompt('etiqueta', brief)
    expect(p).toContain('360')
    expect(p).toContain('FRONT panel (LEFT half)')
    expect(p).toContain('BACK panel (RIGHT half)')
    expect(p).toContain('NOT applied to a container')
    // El reparto es lo que evita que la letra chica se amontone en el frente.
    expect(p).toMatch(/BACK panel \(RIGHT half\)[\s\S]*ingredients/)
    expect(p).toContain('Fabricado por: ____________')
  })

  // El bug: el frente salía como una etiqueta NUEVA. La causa era dictarle un
  // layout que competía con el que ya está en la identidad adjunta.
  it('el frente REPRODUCE la etiqueta de la identidad, no la rediseña', () => {
    const p = buildPrompt('etiqueta', brief)
    expect(p).toContain('It already contains the product label design')
    expect(p).toContain('reproduce the label design from the attached image exactly as it is')
    expect(p).toContain('Do not restyle it, do not rearrange its elements')
    // Nada de prescribir contenido del frente: era lo que lo hacía rediseñar.
    expect(p).not.toContain('only the hero')
    expect(p).not.toContain('no rows of icons')
  })

  it('el mockup es una foto de producto', () => {
    const p = buildPrompt('mockup', brief)
    expect(p).toContain('photorealistic product shot')
    expect(p).toContain('no board layout')
  })
})

describe('formato', () => {
  it('la identidad primero: las piezas la necesitan generada', () => {
    expect(STAGE_SEQUENCE).toEqual(['identidad', 'logo', 'etiqueta', 'mockup'])
  })

  it('identidad y etiqueta apaisadas, logo cuadrado, mockup vertical', () => {
    expect(aspectFor('identidad')).toBe('3:2')   // → 1536x1024
    expect(aspectFor('etiqueta')).toBe('3:2')    // el 360 no cabe en vertical
    expect(aspectFor('logo')).toBe('1:1')
    expect(aspectFor('mockup')).toBe('4:5')
  })
})
