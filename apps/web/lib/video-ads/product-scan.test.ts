import { describe, it, expect } from 'vitest'
import { limpiarEscenaDeFoto, limpiarProductScan } from './product-scan'

describe('limpiarEscenaDeFoto', () => {
  // El caso REAL que lo destapó (sesión `ca62aaed`): estas dos frases finales llegaron al
  // prompt de cada lote y el modelo de FASE 3 las copió dentro de `accionVisual`.
  const real = 'Frasco de vidrio cilíndrico de color violeta translúcido con un gotero de tapa blanca de plástico. El cuerpo es de cuello estrecho y base redondeada. La etiqueta es blanca rectangular con texto negro y detalles en azul claro. El producto descansa sobre una superficie blanca plana y produce una sombra suave a la derecha. No está flotando.'

  it('quita la puesta en escena de la foto y conserva el envase', () => {
    const out = limpiarEscenaDeFoto(real)
    expect(out).toContain('Frasco de vidrio cilíndrico de color violeta translúcido')
    expect(out).toContain('La etiqueta es blanca rectangular')
    expect(out).not.toContain('descansa sobre una superficie')
    expect(out).not.toContain('sombra')
    expect(out).not.toContain('flotando')
  })

  // ⚠️ FALSO POSITIVO MEDIDO en la primera versión del patrón: con `sobre un fondo`
  // adentro, esta frase —que describe la ETIQUETA— se borraba. El modo de fallo correcto
  // es dejar pasar escenografía, nunca comerse la identidad del envase.
  it('no toca una frase que describe la etiqueta aunque diga "sobre un fondo"', () => {
    const etiqueta = 'Las letras son en su mayoría en blanco y rosa sobre un fondo negro.'
    expect(limpiarEscenaDeFoto(etiqueta)).toBe(etiqueta)
  })

  // "sombra de ojos" es un producto entero: el patrón exige un adjetivo de sombra
  // proyectada para no comerse un nicho de cosmética completo.
  it('no confunde una sombra de ojos con la sombra de la foto', () => {
    const producto = 'Paleta de sombra de ojos con doce tonos mate y satinados.'
    expect(limpiarEscenaDeFoto(producto)).toBe(producto)
  })

  it('si el patrón se llevaría todo, devuelve el original', () => {
    const solo = 'No está flotando.'
    expect(limpiarEscenaDeFoto(solo)).toBe(solo)
  })

  it('una descripción limpia se devuelve idéntica', () => {
    const limpia = 'Frasco ámbar de 30 ml con gotero. Etiqueta blanca con texto negro.'
    expect(limpiarEscenaDeFoto(limpia)).toBe(limpia)
    expect(limpiarProductScan({ productDescription: limpia })).toEqual({ productDescription: limpia })
  })

  it('un scan nulo o sin descripción pasa tal cual', () => {
    expect(limpiarProductScan(null)).toBeNull()
    expect(limpiarProductScan({ productDescription: '' })).toEqual({ productDescription: '' })
  })
})
