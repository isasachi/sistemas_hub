import { describe, it, expect } from 'vitest'
import { slotsLargos, correccionDeSlots, conceptosDuplicados, buildPlanPrompt, buildCopyPrompt } from './lote'
import { getTemplate, slotsDelModelo, type TemplateSlot } from './templates'
import { PLANS, anunciosPosibles, opcionesDeLote } from '@ph/shared'

const DEFS: TemplateSlot[] = [
  { id: 'HOOK', rol: 'hook', etiqueta: 'Titular', maxPalabras: 5, tono: 'x', fuente: 'modelo' },
  { id: 'CTA', rol: 'cta', etiqueta: 'CTA', maxPalabras: 3, tono: 'x', fuente: 'modelo' },
]

describe('el cap del lote por plan', () => {
  it('es 3 / 5 / 10 — la decisión del dueño del repo', () => {
    expect(PLANS[1].anunciosPorLote).toBe(3)
    expect(PLANS[2].anunciosPorLote).toBe(5)
    expect(PLANS[3].anunciosPorLote).toBe(10)
  })

  // ⚠️ Los dos topes son distintos y hacen falta los dos. Sin recortar por créditos, un plan 3
  // con 4 créditos pide 10 anuncios, el lote arranca y muere a mitad con parte ya gastada.
  it('los créditos recortan el cap del plan', () => {
    expect(anunciosPosibles(3, 180)).toBe(10)
    expect(anunciosPosibles(3, 4)).toBe(4)
    expect(anunciosPosibles(1, 100)).toBe(3)
  })

  it('sin créditos no se ofrece ninguno — no se ofrece 1', () => {
    expect(anunciosPosibles(2, 0)).toBe(0)
    expect(opcionesDeLote(0)).toEqual([])
  })

  it('las opciones incluyen SIEMPRE el máximo alcanzable, sea redondo o no', () => {
    expect(opcionesDeLote(10)).toEqual([1, 3, 5, 10])
    expect(opcionesDeLote(5)).toEqual([1, 3, 5])
    expect(opcionesDeLote(3)).toEqual([1, 3])
    expect(opcionesDeLote(4)).toEqual([1, 3, 4])
    expect(opcionesDeLote(1)).toEqual([1])
  })
})

describe('slotsLargos — §12 sin romper el texto', () => {
  it('deja pasar lo que entra', () => {
    expect(slotsLargos([{ slot: 'HOOK', texto: 'Tres errores que lo empeoran' }], DEFS)).toEqual([])
  })

  it('tolera la holgura del 20 % y caza lo que se pasa de verdad', () => {
    // 6 palabras contra un tope de 5: ceil(5 * 1.2) = 6, entra justo.
    expect(slotsLargos([{ slot: 'HOOK', texto: 'uno dos tres cuatro cinco seis' }], DEFS)).toEqual([])
    expect(slotsLargos([{ slot: 'HOOK', texto: 'uno dos tres cuatro cinco seis siete' }], DEFS)).toEqual(['HOOK'])
  })

  it('un slot que la plantilla no declara no se juzga', () => {
    expect(slotsLargos([{ slot: 'DESCONOCIDO', texto: 'a b c d e f g h i j' }], DEFS)).toEqual([])
  })

  // El reintento tiene que NOMBRAR el hueco: un reintento ciego devuelve lo mismo.
  it('la corrección nombra el hueco y su tope', () => {
    const c = correccionDeSlots(['CTA'], DEFS)
    expect(c).toContain('CTA')
    expect(c).toContain('3')
  })
})

describe('conceptosDuplicados — §22', () => {
  it('caza dos variantes que son la misma', () => {
    const dup = conceptosDuplicados([
      { concepto: 'errores', angulo: 'las manchas siguen volviendo' },
      { concepto: 'errores', angulo: 'las manchas vuelven siempre' },
    ])
    expect(dup).toEqual([[0, 1]])
  })

  it('no marca variantes genuinamente distintas', () => {
    expect(
      conceptosDuplicados([
        { concepto: 'errores', angulo: 'irrita demasiado su piel' },
        { concepto: 'mitos', angulo: 'cree que el sol no afecta en invierno' },
        { concepto: 'objecion', angulo: 'duda de si sirve para piel sensible' },
      ])
    ).toEqual([])
  })

  it('un lote de una sola variante no tiene con qué chocar', () => {
    expect(conceptosDuplicados([{ concepto: 'errores', angulo: 'x' }])).toEqual([])
  })
})

describe('los prompts del lote', () => {
  const ctx = {
    template: getTemplate('educativo-3-puntos')!,
    productName: 'Eunoia',
    whatItIs: 'sérum con niacinamida',
    whatItDoes: 'reduce la apariencia de manchas',
    targetAudience: 'Mujeres 20-35',
    brandingDescription: 'NIACINAMIDA 10%',
    productDescription: 'frasco ámbar con gotero',
    comments: 'me siguen saliendo, ya probé de todo',
  }

  it('el planificador pide EXACTAMENTE n y nombra los huecos de la plantilla', () => {
    const p = buildPlanPrompt(ctx, 6)
    expect(p).toContain('EXACTAMENTE 6')
    for (const s of slotsDelModelo(ctx.template)) expect(p).toContain(s.id)
  })

  // §10: primero se decide la lógica, después se redacta. Si el escritor no recibe el concepto,
  // el planificador fue decorativo y las N variantes vuelven a ser N tiros al aire.
  it('el escritor recibe el concepto ya decidido', () => {
    const p = buildCopyPrompt(ctx, { concepto: 'mitos', angulo: 'cree que el sol no afecta', mensaje: 'X' })
    expect(p).toContain('mitos')
    expect(p).toContain('cree que el sol no afecta')
  })

  it('el escritor lleva las reglas propias de su plantilla', () => {
    const p = buildCopyPrompt(ctx, { concepto: 'c', angulo: 'a', mensaje: 'm' })
    for (const r of ctx.template.reglasCopy) expect(p).toContain(r)
  })

  it('la corrección de largo entra al prompt del reintento', () => {
    const p = buildCopyPrompt(ctx, { concepto: 'c', angulo: 'a', mensaje: 'm' }, 'REESCRIBE POINT_1')
    expect(p).toContain('REESCRIBE POINT_1')
  })

  // ⚠️ Todo lo que llega a un prompt con FORMA DE VALOR se convierte en una plantilla que
  // rellenar — este repo lo pagó cuatro veces (el "S/ 199" de la oferta, el "3x2" del checklist,
  // la FASE 3 de video, el ejemplo de `transicion`). Los ejemplos de estos prompts son de
  // CATEGORÍA ("errores", "mitos"), nunca copy listo para imprimir.
  it('ningún prompt trae un anti-ejemplo con forma de copy final', () => {
    const p = buildPlanPrompt(ctx, 3) + buildCopyPrompt(ctx, { concepto: 'c', angulo: 'a', mensaje: 'm' })
    expect(p).not.toMatch(/S\/\s?\d/)
    expect(p).not.toMatch(/\d+x\d+/)
    expect(p).not.toMatch(/★|⭐/)
  })
})
