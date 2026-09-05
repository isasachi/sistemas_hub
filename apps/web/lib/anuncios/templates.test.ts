import { describe, it, expect } from 'vitest'
import { TEMPLATES, TEMPLATE_IDS, getTemplate, slotsDelModelo } from './templates'
import { ReferenceAnalysisSchema } from '@/lib/types'

describe('las 8 plantillas', () => {
  it('son 8 y sus ids son únicos', () => {
    expect(TEMPLATES).toHaveLength(8)
    expect(new Set(TEMPLATE_IDS).size).toBe(8)
  })

  // ⚠️ EL TEST QUE IMPORTA. El blueprint se escribe a mano, y se persiste en
  // `sessions.reference_analysis` para que TODO el pipeline existente lo lea sin cambios.
  // `generate-image`, `generate-copy` y `analyze-product` hacen `ReferenceAnalysisSchema.parse`
  // sobre él: un campo mal escrito acá no falla al elegir la plantilla, falla tres pasos después
  // con la cuota del producto ya gastada.
  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    '%s: su blueprint parsea como ReferenceAnalysis',
    (_id, t) => {
      expect(() => ReferenceAnalysisSchema.parse(t.blueprint)).not.toThrow()
    }
  )

  // Una plantilla es agnóstica del producto: no puede apuntar a una zona del cuerpo antes de
  // saber qué se vende. Con `bodyFocus` en null, §10 de STEP5 se salta el re-apuntado, que es lo
  // correcto — no hay ningún marcador mal apuntado que corregir.
  it('ninguna declara zona del cuerpo', () => {
    for (const t of TEMPLATES) expect(t.blueprint.bodyFocus).toBeNull()
  })

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s: slots bien formados', (_id, t) => {
    expect(t.slots.length).toBeGreaterThan(0)
    expect(new Set(t.slots.map((s) => s.id)).size).toBe(t.slots.length)
    for (const s of t.slots) {
      expect(s.id).toMatch(/^[A-Z0-9_]+$/)
      expect(s.maxPalabras).toBeGreaterThan(0)
    }
    // Al menos un slot lo redacta el modelo, si no el lote no tendría nada que variar.
    expect(slotsDelModelo(t).length).toBeGreaterThan(0)
  })

  // §8 del spec: nunca `{TEXT_1}`. El nombre del slot es su rol persuasivo — es lo que le
  // permite al planificador decidir qué idea va en cada hueco antes de redactar.
  it('ningún slot se llama por posición o por número pelado', () => {
    for (const t of TEMPLATES)
      for (const s of t.slots)
        expect(s.id).not.toMatch(/^(TEXT|TEXTO|SLOT|CAMPO)_?\d*$/)
  })

  // El nombre de la marca no se le pide a un modelo que lo puede reescribir: lo copia el código
  // desde la sesión. Cada plantilla que lo muestre tiene que declararlo `fuente: 'producto'`.
  it('PRODUCT_NAME, donde exista, sale del producto y no del modelo', () => {
    for (const t of TEMPLATES) {
      const s = t.slots.find((x) => x.id === 'PRODUCT_NAME')
      if (s) expect(s.fuente).toBe('producto')
    }
  })

  it('getTemplate resuelve por id y devuelve null para lo desconocido', () => {
    expect(getTemplate('antes-despues')?.nombre).toBe('Antes y después')
    expect(getTemplate('no-existe')).toBeNull()
    expect(getTemplate(null)).toBeNull()
  })
})
