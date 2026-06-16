import { describe, it, expect } from 'vitest'
import { isOffTopic } from '@/lib/product-hunter/offtopic'

type Creative = { body: string | null; title: string | null; cta: string | null; link: string | null }

const noCreatives: Creative[] = []

describe('isOffTopic', () => {
  it('retorna false para producto on-topic (rodillera en nicho rodilla)', () => {
    expect(isOffTopic('Rodillera Pro', noCreatives, 'rodilla', 'rodillera')).toBe(false)
  })

  it('retorna false cuando el creativo menciona la categoría', () => {
    const creatives: Creative[] = [{ body: 'Alivia el dolor de rodilla', title: null, cta: null, link: null }]
    expect(isOffTopic('Shop Express', creatives, 'rodilla', 'dolor rodilla')).toBe(false)
  })

  it('retorna true para producto claramente off-topic (cocina en nicho rodilla)', () => {
    const creatives: Creative[] = [{ body: 'Sartén antiadherente para tu cocina', title: 'Cocina Pro', cta: null, link: null }]
    expect(isOffTopic('Sartén Express', creatives, 'rodilla', 'rodillera')).toBe(true)
  })

  it('retorna false cuando falta señal de categoría (conservador)', () => {
    // Sin tokens válidos en la categoría → no puede juzgar → deja pasar
    expect(isOffTopic('Producto', noCreatives, '', '')).toBe(false)
  })

  it('usa sinónimos: faja lumbar debería pasar en nicho espalda', () => {
    expect(isOffTopic('Faja Lumbar Ortopédica', noCreatives, 'espalda', 'dolor espalda')).toBe(false)
  })

  it('usa prefijos: mascotas debería pasar en nicho mascota', () => {
    const creatives: Creative[] = [{ body: 'Ideal para tus mascotas', title: null, cta: null, link: null }]
    expect(isOffTopic('Pet Shop', creatives, 'mascota', 'perro')).toBe(false)
  })
})
