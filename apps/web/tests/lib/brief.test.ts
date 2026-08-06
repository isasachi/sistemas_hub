import { describe, it, expect } from 'vitest'
import {
  firstIncompleteStep, isComplete, isResumable, resumePath, brandSlug,
  brandNameError, descriptionError, STEPS, CATEGORY_CHIPS, DEFAULT_STYLE,
  type PartialBrief,
} from '@/lib/branding/brief'

const full: PartialBrief = {
  category: 'mascotas',
  productDescription: 'Snacks blandos de pollo para perros pequeños',
  brandName: 'Miru',
  audience: ['Dueños de perros'],
  feel: ['Artesanal'],
  style: { ...DEFAULT_STYLE, inspiration: 'x', graphicStyle: 'y', products: 'Pote' },
}

describe('validación del brief', () => {
  it('exige 2..30 caracteres en el nombre de marca', () => {
    expect(brandNameError('M')).toBeTruthy()
    expect(brandNameError('Mi')).toBeNull()
    expect(brandNameError('x'.repeat(30))).toBeNull()
    expect(brandNameError('x'.repeat(31))).toBeTruthy()
  })

  it('exige 10 caracteres en la descripción', () => {
    expect(descriptionError('gomitas')).toBeTruthy()
    expect(descriptionError('gomitas de mango')).toBeNull()
  })
})

describe('retomar donde se quedó', () => {
  it('un brief entero está completo y su ruta es el editor', () => {
    expect(isComplete(full)).toBe(true)
    expect(firstIncompleteStep(full)).toBe(5)
    expect(resumePath(full)).toBe(STEPS[4].path)
    expect(isResumable(full)).toBe(false)
  })

  it('cada campo faltante manda a su propia pregunta', () => {
    const cases: [PartialBrief, number][] = [
      [{}, 0],
      [{ category: 'skincare' }, 0],
      [{ ...full, productDescription: 'corto' }, 0],
      [{ ...full, brandName: undefined }, 1],
      [{ ...full, brandName: 'M' }, 1],
      [{ ...full, audience: [] }, 2],
      [{ ...full, feel: undefined }, 3],
      [{ ...full, style: undefined }, 4],
    ]
    for (const [b, step] of cases) {
      expect(firstIncompleteStep(b), JSON.stringify(b)).toBe(step)
      expect(resumePath(b)).toBe(STEPS[step].path)
    }
  })

  // El candado de la compatibilidad: una sesión anterior al editor no tiene actitud
  // guardada y llega con `feel: []`. Si eso no pasara el gate, su kit tiraría 400.
  it('una actitud vacía cuenta como respondida; undefined no', () => {
    expect(firstIncompleteStep({ ...full, feel: [] })).toBe(5)
    expect(firstIncompleteStep({ ...full, feel: undefined })).toBe(3)
  })

  it('algo respondido pero incompleto es retomable; vacío no', () => {
    expect(isResumable({ brandName: 'Miru' })).toBe(true)
    expect(isResumable({})).toBe(false)
  })
})

describe('slug de marca para el zip', () => {
  it('transliterá tildes y ñ en vez de perderlas', () => {
    expect(brandSlug('Lumé')).toBe('lume')
    expect(brandSlug('Peñita Café')).toBe('penita-cafe')
    expect(brandSlug('  Añañau  ')).toBe('ananau')
  })

  it('nunca devuelve vacío', () => {
    expect(brandSlug('***')).toBe('marca')
  })
})

describe('chips de categoría', () => {
  it('son 6 y todas menos "otro" siembran un ejemplo concreto', () => {
    expect(CATEGORY_CHIPS).toHaveLength(6)
    for (const c of CATEGORY_CHIPS) {
      if (c.category === 'otro') continue
      expect(descriptionError(c.example), c.category).toBeNull()
    }
  })
})
