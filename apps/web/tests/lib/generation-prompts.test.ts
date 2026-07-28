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
    const s = referenceBlock({ ...base, sameProduct: true }, 'label')
    expect(s).toMatch(/same product/i)
    expect(s).toMatch(/reproduce/i)
    expect(s).not.toMatch(/DIFFERENT product/i)
  })

  it('en la rama de traspaso nombra el producto del usuario y prohíbe copiar la silueta', () => {
    const s = referenceBlock({ ...base, sameProduct: false, productType: 'rodillera', referenceProductType: 'serum facial' }, 'label')
    expect(s).toMatch(/DIFFERENT product/i)
    expect(s).toContain('rodillera')
    expect(s).toMatch(/do not copy the silhouette/i)
  })

  it('siempre pide un sello distintivo propio, en las dos ramas', () => {
    expect(referenceBlock({ ...base, sameProduct: true }, 'label')).toMatch(/ONE distinctive signature/i)
    expect(referenceBlock({ ...base, sameProduct: false }, 'label')).toMatch(/ONE distinctive signature/i)
  })

  // --- Fix round 1 (findings 1-3 del review de Task 8) ---------------------

  it('finding 1: en la rama de clonado, el sello NO queda excluido por un "Change ONLY" cerrado', () => {
    // El bug original: "Change ONLY: wordmark, copy, paleta." seguido de una
    // frase aparte "Introduce ONE distinctive signature..." — el sello es un
    // cuarto tipo de cambio que "ONLY" ya cerró. El modelo tiene que elegir
    // entre honrar "ONLY" (y perder el sello) o violar el "ONLY" explícito.
    for (const target of ['label', 'mockup'] as const) {
      const s = referenceBlock({ ...base, sameProduct: true }, target)
      expect(s).not.toMatch(/change only/i)
    }
  })

  it('finding 1 (traspaso): tampoco cierra los cambios con un "ONLY" que excluya el sello', () => {
    for (const target of ['label', 'mockup'] as const) {
      const s = referenceBlock({ ...base, sameProduct: false, productType: 'rodillera', referenceProductType: 'serum facial' }, target)
      expect(s).not.toMatch(/change only/i)
    }
  })

  it('finding 2: target label no pide lighting/finish/materials (es arte plano, no foto)', () => {
    const cloneLabel = referenceBlock({ ...base, sameProduct: true }, 'label')
    expect(cloneLabel).not.toMatch(/lighting/i)
    expect(cloneLabel).not.toMatch(/\bfinish\b/i)
    expect(cloneLabel).not.toMatch(/materials?/i)

    const transferLabel = referenceBlock({ ...base, sameProduct: false, productType: 'rodillera', referenceProductType: 'serum facial' }, 'label')
    expect(transferLabel).not.toMatch(/lighting/i)
    expect(transferLabel).not.toMatch(/\bfinish\b/i)
    expect(transferLabel).not.toMatch(/materials?/i)
  })

  it('finding 2: target mockup SÍ pide lighting/finish/materials (propiedades físicas/foto)', () => {
    const cloneMockup = referenceBlock({ ...base, sameProduct: true }, 'mockup')
    expect(cloneMockup).toMatch(/lighting/i)
    expect(cloneMockup).toMatch(/\bfinish\b/i)
    expect(cloneMockup).toMatch(/materials?/i)

    const transferMockup = referenceBlock({ ...base, sameProduct: false, productType: 'rodillera', referenceProductType: 'serum facial' }, 'mockup')
    expect(transferMockup).toMatch(/lighting/i)
    expect(transferMockup).toMatch(/materials?/i)
  })

  it('finding 3: target mockup nombra la referencia como FOTO distinta de la etiqueta ya adjunta', () => {
    for (const brief of [
      { ...base, sameProduct: true },
      { ...base, sameProduct: false, productType: 'rodillera', referenceProductType: 'serum facial' },
    ] as const) {
      const s = referenceBlock(brief, 'mockup')
      // No debe usar la frase ambigua que también podría leerse como la
      // primera imagen adjunta (la etiqueta).
      expect(s).not.toMatch(/the attached reference image/i)
      expect(s).toMatch(/photograph/i)
      // Debe dejar explícito que wordmark/color ya están resueltos por la
      // etiqueta (primera imagen adjunta), para no pelear con esa instrucción.
      expect(s).toMatch(/already fixed by the first attached image/i)
    }
  })

  it('finding 3: target label sigue refiriéndose directo a la foto de referencia (única adjunta no-wireframe)', () => {
    const s = referenceBlock({ ...base, sameProduct: true }, 'label')
    expect(s).toMatch(/reference photograph/i)
  })

  it('el cierre de la rama clonado x label fija que todo lo no listado debe igualar la referencia', () => {
    // Pinnea la frase reescrita en el fix round 1, hasta ahora sólo verificada
    // por prosa en el reporte, no por un assert.
    const s = referenceBlock({ ...base, sameProduct: true }, 'label')
    expect(s).toContain('Everything not listed above must match the reference.')
  })
})

// --- Fix round 2 (findings 1-2 del re-review de Task 8) ---------------------
//
// Ambos findings son sobre una SEGUNDA instrucción, en otro lugar del prompt
// ENSAMBLADO, que contradice a `referenceBlock` — por eso estos tests llaman
// a `buildLabelPrompt`/`buildMockupPrompt` completos, no a `referenceBlock`
// aislado (el conflicto sólo es visible en el texto ensamblado).

describe('fix round 2: precedencia wireframe vs. referencia (finding 1)', () => {
  it('el prompt de etiqueta declara que el wireframe gobierna la geometría de zonas y la referencia todo lo demás', () => {
    for (const brief of [
      { ...base, sameProduct: true },
      { ...base, sameProduct: false, productType: 'rodillera', referenceProductType: 'serum facial' },
    ] as const) {
      const p = buildLabelPrompt(brief, DNA, LAYOUT)
      // Precedencia explícita: el skeleton manda en geometría/proporción de
      // zonas; la referencia manda en todo lo demás (tipografía, grafismos,
      // color, textura). Sin esto, dos imágenes adjuntas reclaman autoridad
      // sobre el layout sin que quede dicho cuál gana.
      expect(p).toMatch(/LAYOUT SKELETON/)
      expect(p).toMatch(/governs the panel's zone geometry/i)
      expect(p).toMatch(/reference photograph governs everything else/i)
    }
  })
})

describe('fix round 2: el mockup de traspaso no reafirma la escena de la referencia (finding 2)', () => {
  const transferBrief: BrandBrief = {
    ...base,
    sameProduct: false,
    productType: 'rodillera',
    referenceProductType: 'serum facial',
    containerType: 'blíster',
  }

  it('el mockup de traspaso NO contiene la aserción desnuda "Scene: <composición de la referencia>"', () => {
    const p = buildMockupPrompt(transferBrief, DNA)
    // Negativo: la escena literal del producto de referencia (DNA.composition
    // = "frasco centrado", el frasco del serum) no debe aparecer como "Scene:"
    // desnudo para una rodillera — sería reafirmar la forma física prohibida
    // tres frases antes por referenceBlock ("Do not copy ... the physical form").
    expect(p).not.toContain(`Scene: ${DNA.composition}.`)
    expect(p).not.toMatch(/Scene: frasco centrado\b/i)
  })

  it('el mockup de traspaso SÍ pide adoptar el lenguaje de puesta en escena de la referencia', () => {
    const p = buildMockupPrompt(transferBrief, DNA)
    expect(p).toMatch(/staging/i)
    // Debe seguir prohibiendo copiar la forma/objeto de la referencia (ya lo
    // hace referenceBlock) — este test confirma que la línea Scene: no lo
    // contradice reintroduciendo el objeto de la referencia.
    expect(p).toMatch(/do not copy the silhouette/i)
  })

  it('el mockup de CLONADO sí conserva "Scene: <composición>" (redundante pero no conflictivo)', () => {
    const p = buildMockupPrompt({ ...base, sameProduct: true }, DNA)
    expect(p).toContain(`Scene: ${DNA.composition}.`)
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
