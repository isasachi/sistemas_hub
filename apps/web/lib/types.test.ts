import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { ReferenceAnalysisSchema, ProductScanSchema } from './types'

// Los tres campos nuevos (bodyFocus, attentionMarkers, brandColors) son `.nullable().catch(null)`
// y NO `.nullish()`, que es la diferencia entera:
//  - `.nullish()` sale del `required` del JSON Schema que `callStructured` le pasa al modelo, y lo
//    que no se le exige lo omite en silencio → el eje queda en no-op con el síntoma idéntico al
//    bug que vino a arreglar (ya pasó con `body_focus` en landing y con `style` en el ADN de marca).
//  - `.nullable()` a secas revienta el parse de toda sesión guardada antes de este cambio, y ese
//    parse corre en generate-image, generate-copy y analyze-product sobre el jsonb ya persistido.
// El `.catch(null)` es lo que compra las dos cosas a la vez.
const refBase = {
  format: { ratio: '9:16', platform: 'instagram' },
  style: 'ugc',
  composition: ['a'],
  replacements: [],
  physicalPosition: 'Está apoyado en una superficie. No está flotando.',
  colorimetry: 'crema',
  typography: 'sans',
  persuasiveLogic: 'antes/después',
  layoutDescription: 'split vertical',
  sceneElements: { people: [], props: [], brandElements: [], setting: 'estudio' },
  summaryForUser: 'ok',
}
const scanBase = { productDescription: 'frasco ámbar', summaryForUser: 'ok' }

const required = (schema: z.ZodType) =>
  (z.toJSONSchema(schema) as { required?: string[] }).required ?? []

describe('zona del cuerpo y colores de marca', () => {
  it('una sesión guardada ANTES de estos campos sigue parseando, con null', () => {
    const ref = ReferenceAnalysisSchema.parse(refBase)
    expect(ref.bodyFocus).toBeNull()
    expect(ref.attentionMarkers).toBeNull()
    expect(ProductScanSchema.parse(scanBase).brandColors).toBeNull()
  })

  it('el modelo está OBLIGADO a emitirlos: los tres siguen en el required del JSON Schema', () => {
    expect(required(ReferenceAnalysisSchema)).toEqual(
      expect.arrayContaining(['bodyFocus', 'attentionMarkers'])
    )
    expect(required(ProductScanSchema)).toContain('brandColors')
  })

  it('una zona fuera del vocabulario cae a null en vez de romper el paso 5', () => {
    expect(ReferenceAnalysisSchema.parse({ ...refBase, bodyFocus: 'barriga' }).bodyFocus).toBeNull()
    expect(ReferenceAnalysisSchema.parse({ ...refBase, bodyFocus: 'abdomen' }).bodyFocus).toBe('abdomen')
  })

  it('los valores buenos pasan intactos', () => {
    const ref = ReferenceAnalysisSchema.parse({
      ...refBase,
      bodyFocus: 'gluteos_piernas',
      attentionMarkers: ['flecha amarilla desde el copy izquierdo hasta el abdomen'],
    })
    expect(ref.attentionMarkers).toHaveLength(1)
    expect(ProductScanSchema.parse({ ...scanBase, brandColors: ['#BD1347', '#F6F2EB'] }).brandColors)
      .toEqual(['#BD1347', '#F6F2EB'])
  })
})
