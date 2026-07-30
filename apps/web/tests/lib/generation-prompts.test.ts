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

// --- Fix round 1 (probe end-to-end, defecto real: "Aurelia" ausente) -------
//
// El probe de Task 9 generó belleza/serum-facial con brand_name="Aurelia",
// product_name="Lúmina": la etiqueta puso "Lúmina" tanto en la banda de marca
// chica de arriba como en el wordmark hero grande — "Aurelia" no apareció en
// ningún punto del panel, sólo en el logo (asset aparte). La causa: el prompt
// nunca mencionaba brief.brandName como elemento del panel.

describe('fix round 1: el brand name es un elemento propio de la etiqueta, distinto del hero', () => {
  const brandBrief: BrandBrief = { ...base, brandName: 'Aurelia', productName: 'Lúmina' }

  it('declara el brand name como su propio elemento, con instrucción de escala menor que el hero', () => {
    const p = buildLabelPrompt(brandBrief, DNA, LAYOUT)
    // No basta con que "Aurelia" aparezca de rebote dentro del sello distintivo
    // de referenceBlock ("derived from the brand ...") — tiene que tener su
    // propia instrucción de texto, formulada como "brand name".
    expect(p).toMatch(/brand name "Aurelia"/)
    expect(p).toMatch(/smaller/i)
  })

  it('el hero sigue siendo el nombre de producto, no el de marca', () => {
    const p = buildLabelPrompt(brandBrief, DNA, LAYOUT)
    expect(p).toMatch(/product name "Lúmina"/)
    expect(p).toMatch(/hero/i)
  })

  it('el brand name recibe la misma instrucción de ortografía exacta (exactText) que el producto', () => {
    const p = buildLabelPrompt(brandBrief, DNA, LAYOUT)
    expect(p).toContain('Render the brand name exactly as "Aurelia", spelled correctly.')
  })

  it('prohíbe pegar el logo aparte tanto para el hero como para el brand name (dos instancias)', () => {
    const p = buildLabelPrompt(brandBrief, DNA, LAYOUT)
    const matches = p.match(/logo mark/gi) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('guard de caso degenerado: sin product name, el wordmark hero ES el brand name y no se duplica', () => {
    const noProductBrief: BrandBrief = { ...base, brandName: 'Aurelia', productName: undefined }
    const p = buildLabelPrompt(noProductBrief, DNA, LAYOUT)
    // El fallback preexistente sigue vigente: el hero cae al brand name.
    expect(p).toMatch(/product name "Aurelia"/)
    // Pero el prompt debe decir EXPLÍCITAMENTE que no se imprima dos veces.
    expect(p).toMatch(/do not print the brand name a second time|one instance of the word is enough/i)
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

// --- Fix round 2 (mockup): el modelo re-tipografía en vez de warpear el label --
//
// Defecto real de probe (Task 9, dos de tres generaciones): en `transfer-mockup.png`
// "PROTECCIÓN" salió como "PROTTECIÓN" (doble T) mientras el label fuente estaba
// bien escrito; en `clone2-mockup.png` una banda entera de microtexto salió
// MIRROREADA ("ГЛЕЯО FACIAL CON YA ЯИIL C"). El wordmark grande sobrevive intacto
// en ambos casos — la firma del defecto es re-LETTERING del panel al componer
// sobre el envase, no un warp geométrico del arte adjunto. La frase vieja
// ("preserving the label's design, wordmark, colors and text EXACTLY" + "no
// stray or misspelled text") no nombra la operación prohibida (re-dibujar texto)
// ni el mirroring.

describe('fix round 2: el mockup exige WARPEAR el label como imagen, no re-tipografiarlo', () => {
  it('nombra la operación permitida (warp/wrap geométrico) y prohíbe re-tipografiar', () => {
    const p = buildMockupPrompt(base, DNA)
    expect(p).toMatch(/warp/i)
    expect(p).toMatch(/re-typeset|re-letter|re-flow/i)
  })

  it('exige que cada carácter, incluido el microtexto legal/de ingredientes más chico, quede idéntico', () => {
    const p = buildMockupPrompt(base, DNA)
    expect(p).toMatch(/every character/i)
    expect(p).toMatch(/legal.{0,20}ingredient|ingredient.{0,20}legal/i)
  })

  it('prohíbe explícitamente texto espejado/invertido/al revés', () => {
    const p = buildMockupPrompt(base, DNA)
    expect(p).toMatch(/mirror/i)
    expect(p).toMatch(/revers/i)
    expect(p).toMatch(/upside-down/i)
  })

  it('cuando la curvatura haría el texto ilegible, pide rotar el envase o dejar el texto fuera de cuadro — nunca re-dibujarlo', () => {
    const p = buildMockupPrompt(base, DNA)
    expect(p).toMatch(/rotate the package/i)
    expect(p).toMatch(/out of view|fall out/i)
  })
})

// --- Fix round 3 (findings 1-2 del re-review de Task 9) --------------------
//
// Finding 1: `brandLine` citaba `layout.logoPlacement` textual dentro de una
// frase que también dice "clearly smaller in scale" — falso en el catálogo
// real (belleza/aceite-capilar: logoPlacement = "Centered prominently ...
// moderate size", que se autocontradice con "smaller" en la misma oración).
// Finding 2: en el caso degenerado (sin product name) el prompt describía el
// MISMO string como hero ("give it prominence...") Y como "small, supporting"
// a la vez, más dos exactText casi idénticos para ese string.

describe('fix round 3: brandLine no cita layout.logoPlacement (finding 1)', () => {
  it('con un logoPlacement que se autocontradice con "smaller" (caso real: belleza/aceite-capilar), la frase del brand no lo cita', () => {
    // Texto real de belleza/aceite-capilar en template-dna.ts — "prominently"
    // y "moderate size" contradicen "clearly smaller in scale" si se citan
    // dentro de la misma oración del brand.
    const contradictingLayout: ExtractedLayout = {
      ...LAYOUT,
      logoPlacement: 'Centered prominently on the front panel, occupying a moderate size relative to the overall design.',
    }
    const p = buildLabelPrompt(base, DNA, contradictingLayout)
    // La geometría sigue llegando vía layoutToPrompt ("Logo placement: ...")
    // — separamos el prompt en lo que viene ANTES de esa línea (la frase del
    // brand y el resto de la composición previa) y confirmamos que "prominently"/
    // "moderate" sólo aparecen DESPUÉS, dentro de esa línea de geometría.
    const logoPlacementLineIdx = p.indexOf('Logo placement:')
    expect(logoPlacementLineIdx).toBeGreaterThan(-1)
    const beforeGeometryLine = p.slice(0, logoPlacementLineIdx)
    expect(beforeGeometryLine).not.toMatch(/prominently/i)
    expect(beforeGeometryLine).not.toMatch(/moderate/i)
    // La geometría exacta se sigue entregando, sólo que no en la frase del brand.
    expect(p).toContain('Logo placement: Centered prominently on the front panel, occupying a moderate size relative to the overall design.')
  })

  it('la relación brand/hero se describe sin depender del contenido de logoPlacement', () => {
    const p = buildLabelPrompt(base, DNA, LAYOUT)
    expect(p).toMatch(/brand name "Lavíca"/)
    expect(p).toMatch(/smaller/i)
    // No debe quedar ningún rastro literal del valor de logoPlacement de este
    // fixture ("centrado arriba") dentro del prompt salvo en la línea de
    // `layoutToPrompt` misma.
    const occurrences = p.split('centrado arriba').length - 1
    expect(occurrences).toBe(1) // sólo la línea "Logo placement: centrado arriba."
  })
})

describe('fix round 3: caso degenerado sin contradicción hero vs. small/supporting (finding 2)', () => {
  const degenerateBrief: BrandBrief = { ...base, productName: undefined }

  it('no describe el brand como "small, supporting" cuando ES el hero', () => {
    const p = buildLabelPrompt(degenerateBrief, DNA, LAYOUT)
    expect(p).not.toMatch(/small, supporting/i)
  })

  it('sigue afirmando que ese string es el hero del panel', () => {
    const p = buildLabelPrompt(degenerateBrief, DNA, LAYOUT)
    expect(p).toMatch(/hero of the panel/i)
  })

  it('emite UNA sola instrucción de ortografía exacta para el string (no dos con etiquetas distintas)', () => {
    const p = buildLabelPrompt(degenerateBrief, DNA, LAYOUT)
    const spellingMatches = p.match(/Render the [a-z ]+ exactly as "Lavíca"/gi) ?? []
    expect(spellingMatches.length).toBe(1)
  })
})

describe('fix round 3: el caso NO degenerado sigue ubicando el brand como elemento distinto y más chico', () => {
  it('mantiene dos instrucciones de ortografía separadas, una por nombre', () => {
    const p = buildLabelPrompt(base, DNA, LAYOUT) // brandName 'Lavíca' !== productName 'Nama'
    expect(p).toContain('Render the brand name exactly as "Lavíca", spelled correctly.')
    expect(p).toContain('Render the product name exactly as "Nama", spelled correctly.')
  })

  it('el brand sigue descrito como elemento subordinado, más chico y separado del hero', () => {
    const p = buildLabelPrompt(base, DNA, LAYOUT)
    expect(p).toMatch(/smaller/i)
    expect(p).toMatch(/subordinate|secondary/i)
  })
})

// --- Fix round 4 (defecto real del probe de Task 13) -----------------------
//
// Probe A (clonado, cocina/picador-electrico → "Nordika"/"ChopPro"): la cara
// SUPERIOR de la caja salió con glifos ilegibles y espejados que calcan el
// wordmark de la marca de la REFERENCIA ("AZZARO" → "A ⅃ЯTAЯO"). La etiqueta
// standalone estaba perfecta y el frente de la caja también: el defecto vive
// SÓLO en las superficies que el arte de etiqueta NO cubre (cara superior,
// laterales, canto, hombro/tapa de un frasco). Ahí el modelo no tiene pixel
// que warpear, y `referenceBlock` en clonado le pide "reproduce faithfully" →
// reproduce el lettering de la referencia, degradado. Las frases del fix round
// 2 no lo cubren: todas hablan del texto DEL LABEL adjunto.
describe('fix round 4: superficies del envase que la etiqueta no cubre', () => {
  it('nombra esas superficies y da las dos únicas salidas: el nombre de marca limpio, o nada', () => {
    const p = buildMockupPrompt(base, DNA)
    expect(p).toMatch(/does not cover|not covered/i)
    expect(p).toContain('"Lavíca"')
    expect(p).toMatch(/or nothing at all|or left blank/i)
  })

  it('prohíbe copiar el lettering de la foto de referencia en esas superficies', () => {
    const p = buildMockupPrompt(base, DNA)
    expect(p).toMatch(/never (any )?lettering copied from the reference/i)
  })

  it('aplica en las dos ramas — una caja con cara superior existe igual en traspaso', () => {
    const p = buildMockupPrompt({ ...base, sameProduct: false, referenceProductType: 'serum facial' }, DNA)
    expect(p).toMatch(/does not cover|not covered/i)
    expect(p).toContain('"Lavíca"')
  })
})

// --- Fix round 5 (hallazgo del probe de Task 13) ---------------------------
//
// Los tres probes imprimieron declaraciones REGULATORIAS que nadie puso en el
// brief: "Hecho en China" (probe A), "HECHO EN MÉXICO" y "DERMATOLÓGICAMENTE
// PROBADO" (probe C), más términos de garantía. El anatomy de la plantilla trae
// un bloque de datos y el modelo lo rellena inventando. Un usuario que lleva ese
// mockup a imprenta publica una declaración de origen falsa — y el mercado de la
// herramienta es Perú. El copy de beneficio/ingredientes sí es relleno de diseño
// legítimo (el usuario lo edita); lo que no puede inventarse es origen, sellos y
// claims clínicos.
describe('fix round 5: el panel no inventa declaraciones regulatorias', () => {
  it('prohíbe país de origen, certificaciones y claims clínicos no provistos', () => {
    const p = buildLabelPrompt(base, DNA, LAYOUT)
    expect(p).toMatch(/country of origin/i)
    expect(p).toMatch(/certification|seal/i)
    expect(p).toMatch(/clinical|dermatolog/i)
  })

  it('da la salida: texto neutro de relleno en esas zonas, sin afirmar nada verificable', () => {
    const p = buildLabelPrompt(base, DNA, LAYOUT)
    expect(p).toMatch(/neutral|generic/i)
  })
})
