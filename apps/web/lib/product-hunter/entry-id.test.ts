import { describe, it, expect } from 'vitest'
import { partirEntryId } from '@ph/shared'

// El id de la card es la clave con la que el flujo reclama un producto, así que
// partirlo mal significa reclamar otro (o ninguno).
describe('partirEntryId — la clave del reclamo vuelve a sus columnas', () => {
  it('parte un id de CLUSTER en nicho, página y clave de producto', () => {
    expect(partirEntryId('rodilla:123:tienda.com/products/faja'))
      .toEqual({ niche: 'rodilla', pageId: '123', clusterKey: 'tienda.com/products/faja' })
  })

  it('parte un id de ANUNCIANTE, que no lleva clave de producto', () => {
    expect(partirEntryId('acne:456')).toEqual({ niche: 'acne', pageId: '456', clusterKey: null })
  })

  // ⚠️ El motivo de partir por los DOS PRIMEROS `:` y no con split(':'): la
  // landing puede traer los suyos y perder la cola deja el producto inhallable.
  it('conserva los dos puntos que vengan DENTRO de la clave del producto', () => {
    expect(partirEntryId('rodilla:123:localhost:3000/p/x')?.clusterKey).toBe('localhost:3000/p/x')
  })

  it('un nicho con espacios no lo rompe', () => {
    expect(partirEntryId('caida del cabello:789:t.com/p/a')?.niche).toBe('caida del cabello')
  })

  it('lo que no tiene forma de id devuelve null en vez de adivinar', () => {
    expect(partirEntryId('sinseparador')).toBeNull()
    expect(partirEntryId(':123:x')).toBeNull()
    expect(partirEntryId('')).toBeNull()
  })
})
