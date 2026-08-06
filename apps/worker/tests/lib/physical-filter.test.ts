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
