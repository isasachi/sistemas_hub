import { describe, it, expect } from 'vitest'
import { nonPhysicalSignal, isPhysicalEnough } from '@ph/shared'

// Medido contra los 3,970 anuncios que el LLM ya etiquetó: bloquea el 37% de lo
// no-físico perdiendo 1.8% de los físicos (y 30 de esas 43 pérdidas son
// marketplaces, que igual mueren en la regla 3). El sesgo es no perder producto.

describe('lista negra de no-físicos', () => {
  it('bloquea los clusters grandes', () => {
    expect(nonPhysicalSignal('(Doblado) Este chofer es imparable', 'Ns-yd-0419')?.cluster).toBe('drama')
    expect(nonPhysicalSignal('Láser CO2 para cicatrices', 'Grupo Beauty Liz')?.cluster).toBe('clinica')
    expect(nonPhysicalSignal('Curso de jabones artesanales', 'Academia en Línea')?.cluster).toBe('curso')
    expect(nonPhysicalSignal('Mega Venta', 'Temu Mexico')?.cluster).toBe('marketplace')
  })

  // Estos encabezaban TODAS las categorías del buscador: decenas de miles de
  // anuncios activos y ninguna caja que enviar. "Shoptemu" no empieza con "temu",
  // por eso hay que nombrarlo aparte.
  it('bloquea marketplaces y plataformas que copaban el ranking por anuncios', () => {
    expect(nonPhysicalSignal('Ofertas del día', 'Shoptemu')?.cluster).toBe('marketplace')
    expect(nonPhysicalSignal('Todo para tu hogar', 'Havan')?.cluster).toBe('marketplace')
    expect(nonPhysicalSignal('Viaja a donde quieras', 'Uber')?.cluster).toBe('plataforma')
    expect(nonPhysicalSignal('Escucha lo que quieras', 'Spotify')?.cluster).toBe('plataforma')
    expect(nonPhysicalSignal('Cashback', 'Mercado Pago')?.cluster).toBe('plataforma')
    // Y no se lleva puesto a un producto cuyo nombre solo EMPIEZA parecido.
    expect(isPhysicalEnough('Faja moldeadora', 'Disneyland Fajas')).toBe(true)
  })

  it('deja pasar productos físicos que MENCIONAN a un médico o un tratamiento', () => {
    // El error caro: una crema real citando a una dermatóloga.
    expect(isPhysicalEnough('Una dermatóloga lo explica ✅', 'Auré Profesional')).toBe(true)
    expect(isPhysicalEnough('Deja de gastar en tratamientos que no duran', 'Valentina EC')).toBe(true)
    expect(isPhysicalEnough('Rodillera térmica con imanes', 'OrtoVital')).toBe(true)
  })

  it('la señal de envío manda sobre la lista negra', () => {
    const t = 'Curso rápido de belleza — envío gratis a todo el país'
    expect(isPhysicalEnough(t, 'Tienda X')).toBe(true)
  })

  it('lee el texto en unicode matemático que usa Meta', () => {
    expect(nonPhysicalSignal('𝐋𝐢𝐦𝐩𝐢𝐞𝐳𝐚 𝐟𝐚𝐜𝐢𝐚𝐥 para adolescentes', 'H Centro')?.cluster).toBe('clinica')
  })

  it('sin texto no descarta', () => {
    expect(isPhysicalEnough(null, null)).toBe(true)
    expect(isPhysicalEnough('{{product.name}}', 'Alquimia Botanica')).toBe(true)
  })
})
