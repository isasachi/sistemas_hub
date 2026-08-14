import { describe, it, expect } from 'vitest'
import { segmentar, unir } from './segments'

// El caso que motivó esto: un video sin cortes da UNA toma con el guión entero, y hasta
// ahora eso era una sola línea de 706 caracteres para editar.
const REAL =
  'Tres razones para tomar Gomi Energy para Ella, sobre todo si últimamente andas muy cansada. ' +
  'Número uno, contiene maca roja. Te ayuda a regular el equilibrio hormonal. ' +
  '¿Y sabes qué más? Tiene aguaje. Pruébalo hoy.'

describe('segmentar', () => {
  it('parte por frase, que es el punto natural de corte del spec', () => {
    const s = segmentar(REAL)
    expect(s).toHaveLength(6)
    expect(s[0]).toContain('Tres razones para tomar')
    expect(s[1]).toBe('Número uno, contiene maca roja.')
  })

  it('corta también en interrogación y exclamación', () => {
    expect(segmentar('¿Y sabes qué más? Tiene aguaje. ¡Pruébalo!'))
      .toEqual(['¿Y sabes qué más?', 'Tiene aguaje.', '¡Pruébalo!'])
  })

  // Si devolviera vacío, la toma desaparecería de la pantalla.
  it('un texto sin puntuación es UN segmento, no cero', () => {
    expect(segmentar('una frase larga sin punto final')).toEqual(['una frase larga sin punto final'])
    expect(segmentar('')).toEqual([''])
  })

  it('no parte un decimal ni una abreviatura pegada', () => {
    expect(segmentar('Tiene 2.5 mg por porción.')).toEqual(['Tiene 2.5 mg por porción.'])
  })

  // Un marcador pendiente es lo que bloquea el render: partirlo por la mitad lo
  // volvería irreconocible para `extractPending`.
  it('no parte un marcador [PENDIENTE: …] por dentro', () => {
    const s = segmentar('Contiene [PENDIENTE: ingrediente 1]. Y también otra cosa.')
    expect(s[0]).toBe('Contiene [PENDIENTE: ingrediente 1].')
  })
})

describe('unir', () => {
  // La propiedad que sostiene todo: editar sin tocar nada devuelve el mismo texto, así
  // que abrir el paso del guión no puede ensuciar el dato por sí solo.
  it('el ida y vuelta devuelve el mismo texto', () => {
    expect(unir(segmentar(REAL))).toBe(REAL.trim())
  })

  it('sobrevive el ida y vuelta con marcadores pendientes', () => {
    const t = 'Contiene [PENDIENTE: ingrediente 1]. Te ayuda a dormir.'
    expect(unir(segmentar(t))).toBe(t)
  })

  it('descarta segmentos que el usuario dejó vacíos', () => {
    expect(unir(['Una frase.', '   ', 'Otra frase.'])).toBe('Una frase. Otra frase.')
  })

  it('normaliza el espacio de más entre frases', () => {
    expect(unir(segmentar('Una frase.    Otra frase.'))).toBe('Una frase. Otra frase.')
  })
})
