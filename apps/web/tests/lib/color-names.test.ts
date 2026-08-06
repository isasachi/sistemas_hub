import { describe, it, expect } from 'vitest'
import { colorFromName } from '@/lib/branding/color-names'

const hue = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return 0
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return Math.round(h * 60)
}
const light = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

describe('nombre de color → burbuja', () => {
  it('reconoce los colores del board de referencia', () => {
    for (const n of ['naranja intenso', 'amarillo suave', 'blanco puro', 'lima eléctrico']) {
      expect(colorFromName(n), n).toMatch(/^#[0-9A-F]{6}$/)
    }
    expect(hue(colorFromName('naranja intenso')!)).toBeGreaterThan(10)
    expect(hue(colorFromName('naranja intenso')!)).toBeLessThan(45)
    expect(light(colorFromName('blanco puro')!)).toBeGreaterThan(0.95)
  })

  it('no se traba con tildes ni mayúsculas', () => {
    expect(colorFromName('Lima Eléctrico')).toBe(colorFromName('lima electrico'))
    expect(colorFromName('  ROJO  ')).toBe(colorFromName('rojo'))
  })

  it('los modificadores mueven el tono en la dirección correcta', () => {
    expect(light(colorFromName('azul claro')!)).toBeGreaterThan(light(colorFromName('azul')!))
    expect(light(colorFromName('azul oscuro')!)).toBeLessThan(light(colorFromName('azul')!))
    expect(light(colorFromName('verde pastel')!)).toBeGreaterThan(light(colorFromName('verde')!))
  })

  // "verde oliva" es oliva y "azul marino" es marino: en español el matiz va
  // después del color genérico, así que gana la palabra más tardía.
  it('el matiz manda sobre el color genérico', () => {
    expect(colorFromName('verde oliva')).toBe(colorFromName('oliva'))
    expect(colorFromName('azul marino')).toBe(colorFromName('marino'))
    expect(colorFromName('azul marino')).not.toBe(colorFromName('azul'))
  })

  it('entiende inglés de uso común, color y modificador', () => {
    // Mismo tono que "naranja", pero "bold" lo satura: no es el mismo hex.
    expect(hue(colorFromName('bold orange')!)).toBe(hue(colorFromName('naranja')!))
    expect(colorFromName('bold orange')).not.toBe(colorFromName('orange'))
    expect(light(colorFromName('soft yellow')!)).toBeGreaterThan(light(colorFromName('yellow')!))
    expect(light(colorFromName('dark blue')!)).toBeLessThan(light(colorFromName('blue')!))
  })

  // null es información: el editor pinta la burbuja punteada en vez de inventar
  // un color que el modelo nunca va a usar.
  it('devuelve null cuando no reconoce nada', () => {
    expect(colorFromName('')).toBeNull()
    expect(colorFromName('   ')).toBeNull()
    expect(colorFromName('zzzz qwerty')).toBeNull()
  })

  it('no confunde subcadenas con palabras', () => {
    // "rosado" contiene "rosa", pero \b evita que "arosa" o "grisáceo" cuelen.
    expect(colorFromName('grisáceo')).toBeNull()
    expect(colorFromName('gris apagado')).not.toBeNull()
  })
})
