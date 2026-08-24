import { describe, it, expect } from 'vitest'
import { aTextoPlano, deTextoPlano } from './guion-plano'

const TOMAS = [
  { n: 1, locucion: 'Este es el suero de la marca Lumina.' },
  { n: 2, locucion: '' }, // toma muda: caso legítimo, no un campo sin llenar
  { n: 3, locucion: 'Se aplica de día y de noche. Nada más.' },
]

describe('guion-plano', () => {
  it('el ida y vuelta sin editar devuelve las mismas locuciones', () => {
    expect(deTextoPlano(aTextoPlano(TOMAS), TOMAS.length))
      .toEqual(TOMAS.map((t) => t.locucion))
  })

  it('conserva la toma muda como tramo vacío', () => {
    expect(deTextoPlano(aTextoPlano(TOMAS), 3)?.[1]).toBe('')
  })

  it('acepta el texto ya editado por el usuario', () => {
    const editado = aTextoPlano(TOMAS).replace('suero', 'sérum')
    expect(deTextoPlano(editado, 3)?.[0]).toContain('sérum')
  })

  // El fallo que este módulo existe para evitar: repartir mal el texto entre tomas
  // desincroniza cada clip de su audio y nada lo reporta.
  it('devuelve null si el usuario borra una cabecera', () => {
    const roto = aTextoPlano(TOMAS).replace('--- Toma 2 ---\n', '')
    expect(deTextoPlano(roto, 3)).toBeNull()
  })

  it('devuelve null si aparece una cabecera de más', () => {
    expect(deTextoPlano(`${aTextoPlano(TOMAS)}\n\n--- Toma 4 ---\nde más`, 3)).toBeNull()
  })

  it('devuelve null si hay texto antes de la primera cabecera', () => {
    expect(deTextoPlano(`suelto\n${aTextoPlano(TOMAS)}`, 3)).toBeNull()
  })
})
