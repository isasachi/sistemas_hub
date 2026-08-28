import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { componerBarraConfianza, itemsDeConfianza, RESERVA_PIE } from './trust-bar'
import { GOLD, COPPER } from './palette-derive'
import type { TrustBlock } from './types'

/**
 * Esta pieza existe para GARANTIZAR que la barra sea la misma en las 6 secciones — es la promesa
 * entera del composite, y lo que tres rondas de prompt no lograron. Así que el test que importa
 * no es "se dibuja algo", es "se dibuja EXACTAMENTE lo mismo".
 */

const TRUST: TrustBlock = {
  coverage: ['Perú'], freeShipping: true, deliveryTime: '24/48 horas',
  codDelivery: true, guaranteeDays: 30, guaranteeText: 'Devolución garantizada',
  paymentMethods: [],
} as TrustBlock

/** Una base lisa del tamaño real de una sección 9:16. */
const base = (color: { r: number; g: number; b: number }) =>
  sharp({ create: { width: 360, height: 640, channels: 3, background: color } }).png().toBuffer()

/** Los bytes crudos de la franja inferior, que es lo que el composite controla. */
async function pie(img: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(img).metadata()
  const alto = Math.round(height! * 0.135)
  return sharp(img).extract({ left: 0, top: height! - alto, width: width!, height: alto }).raw().toBuffer()
}

describe('componerBarraConfianza', () => {
  it('produce una franja IDÉNTICA sobre dos secciones distintas', async () => {
    const a = await componerBarraConfianza(await base({ r: 250, g: 250, b: 250 }), TRUST, GOLD, false)
    const b = await componerBarraConfianza(await base({ r: 12, g: 40, b: 90 }), TRUST, GOLD, false)
    // Mismo alto, mismo contenido: el fondo de la sección no puede filtrarse en la banda.
    expect(Buffer.compare(await pie(a), await pie(b))).toBe(0)
  }, 30_000)

  // ⚠️ EL FALLO SILENCIOSO DE ESTA PIEZA ES EL TEXTO EN BLANCO. `resvg` corre con
  // `loadSystemFonts: false`, así que si los .ttf no llegan al bundle (Vercel no traza archivos
  // de datos) la banda se dibuja igual pero SIN una sola letra, y nadie lo nota hasta verla.
  it('dibuja texto de verdad: la banda tiene tinta oscura sobre el metal', async () => {
    const img = await componerBarraConfianza(await base({ r: 250, g: 250, b: 250 }), TRUST, GOLD, false)
    const { width, height } = await sharp(img).metadata()
    const alto = Math.round(height! * 0.085)
    const { data } = await sharp(img)
      .extract({ left: 0, top: height! - Math.round(height! * 0.135), width: width!, height: alto })
      .greyscale().raw().toBuffer({ resolveWithObject: true })
    // El metal es claro; las letras y los iconos son la única tinta oscura de la franja.
    const oscuros = data.reduce((n, v) => n + (v < 90 ? 1 : 0), 0)
    expect(oscuros / data.length).toBeGreaterThan(0.01)
  }, 30_000)

  it('el metal cambia con la rampa: oro y cobre no dan la misma franja', async () => {
    const oro = await componerBarraConfianza(await base({ r: 250, g: 250, b: 250 }), TRUST, GOLD, false)
    const cobre = await componerBarraConfianza(await base({ r: 250, g: 250, b: 250 }), TRUST, COPPER, false)
    expect(Buffer.compare(await pie(oro), await pie(cobre))).not.toBe(0)
  }, 30_000)

  it('sin hechos de confianza no toca la imagen', async () => {
    const vacio = { coverage: [], codDelivery: false, guaranteeDays: 0, paymentMethods: [] } as unknown as TrustBlock
    const src = await base({ r: 250, g: 250, b: 250 })
    expect(await componerBarraConfianza(src, vacio, GOLD, false)).toBe(src)
  })

  it('los ítems salen en el orden de la plantilla y con los hechos de la sesión', () => {
    expect(itemsDeConfianza(TRUST).map((i) => i.icono)).toEqual(['envio', 'entrega', 'pago', 'seguro'])
    expect(itemsDeConfianza(TRUST)[0].titulo).toBe('Envío a domicilio en Perú')
    expect(itemsDeConfianza(TRUST)[3].detalle).toBe('Devolución garantizada')
  })

  // La reserva que se le pide al modelo tiene que cubrir lo que el composite pinta; si fuera
  // menor, su propia banda asomaría por encima — que es lo que pasó con el 12 % justo.
  it('la franja reservada es mayor que la compuesta', () => {
    expect(RESERVA_PIE).toBeGreaterThan(0.085 + 0.05)
  })
})
