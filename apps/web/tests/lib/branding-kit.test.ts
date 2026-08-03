import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import sharp from 'sharp'
import { buildKit, colorsAndTypeText } from '@/lib/branding/kit'
import { logoVariant, frontPanel } from '@/lib/branding/variants'
import { buildBrandboard } from '@/lib/branding/brandboard'
import { getPreset } from '@/lib/branding/presets'

const preset = getPreset('heritage_craft')

/** Logo de juguete: cuadrado oscuro centrado sobre blanco. */
async function fakeLogo(): Promise<Buffer> {
  const dot = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#101010' } }).png().toBuffer()
  return sharp({ create: { width: 60, height: 60, channels: 3, background: '#ffffff' } })
    .composite([{ input: dot, left: 20, top: 20 }])
    .png().toBuffer()
}

const base = (logo: Buffer) => ({
  brandName: 'Peñita Café',
  productDescription: 'Snacks blandos de pollo para perros pequeños',
  audience: ['Dueños de perros'],
  preset,
  logo,
  mockup: logo,
  label: logo,
})

describe('variantes del logo (etapa 4, sin modelo)', () => {
  it('la de negro pinta la tinta de negro y deja transparente el resto', async () => {
    const out = await logoVariant(await fakeLogo(), 'negro')
    const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels
      return [data[i], data[i + 1], data[i + 2], data[i + 3]]
    }
    expect(px(30, 30)).toEqual([0, 0, 0, 255])   // centro = tinta
    expect(px(2, 2)[3]).toBe(0)                   // esquina = transparente
  })

  it('la de blanco pinta la misma forma de blanco', async () => {
    const out = await logoVariant(await fakeLogo(), 'blanco')
    const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const i = (30 * info.width + 30) * info.channels
    expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([255, 255, 255, 255])
  })
})

describe('frente de la etiqueta 360', () => {
  it('es la mitad izquierda exacta, misma altura', async () => {
    const label = await sharp({ create: { width: 300, height: 100, channels: 3, background: '#ffffff' } })
      .composite([{
        input: await sharp({ create: { width: 150, height: 100, channels: 3, background: '#ff0000' } }).png().toBuffer(),
        left: 0, top: 0,
      }])
      .png().toBuffer()

    const front = await frontPanel(label)
    const meta = await sharp(front).metadata()
    expect([meta.width, meta.height]).toEqual([150, 100])

    // El frente es el panel rojo entero: si recortara del lado equivocado saldría blanco.
    const { data, info } = await sharp(front).raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels
      return [data[i], data[i + 1], data[i + 2]]
    }
    expect(px(5, 50)).toEqual([255, 0, 0])
    expect(px(145, 50)).toEqual([255, 0, 0])
  })
})

describe('brandboard', () => {
  it('sale un PDF de verdad con las piezas dentro', async () => {
    const pdf = await buildBrandboard(base(await fakeLogo()))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(1000)
  })

  it('no revienta si falta una pieza', async () => {
    const pdf = await buildBrandboard({ ...base(await fakeLogo()), mockup: null, label: null, logo: null })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})

describe('zip del kit', () => {
  it('tiene la estructura del spec bajo el slug de la marca', async () => {
    const logo = await fakeLogo()
    const { zip, filename } = await buildKit({ ...base(logo), brandboard: await buildBrandboard(base(logo)) })
    expect(filename).toBe('penita-cafe.zip')

    const entries = Object.keys((await JSZip.loadAsync(zip)).files).filter((f) => !f.endsWith('/'))
    expect(new Set(entries)).toEqual(new Set([
      'penita-cafe/brandboard.pdf',
      'penita-cafe/logo/logo.png',
      'penita-cafe/logo/logo-negro.png',
      'penita-cafe/logo/logo-blanco.png',
      'penita-cafe/etiqueta/etiqueta-360.png',
      'penita-cafe/etiqueta/etiqueta-frontal.png',
      'penita-cafe/mockups/mockup.png',
      'penita-cafe/colores-y-tipografias.txt',
    ]))
  })

  it('el txt lleva los 5 colores y las 2 tipografías', async () => {
    const txt = colorsAndTypeText({ ...base(await fakeLogo()), brandboard: null })
    for (const hex of Object.values(preset.palette)) expect(txt).toContain(hex)
    expect(txt).toContain(preset.typography.display)
    expect(txt).toContain(preset.typography.body)
  })
})

describe('las etapas 4 y 5 no tocan el modelo', () => {
  it('ni el kit, ni las variantes, ni el brandboard importan el motor de imagen', () => {
    for (const f of ['kit.ts', 'variants.ts', 'brandboard.ts']) {
      const src = fs.readFileSync(path.join(process.cwd(), 'lib/branding', f), 'utf8')
      expect(src, f).not.toMatch(/from '@\/lib\/(gemini|llm-openai)'/)
    }
  })
})
