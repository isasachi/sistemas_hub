import { describe, it, expect, vi, beforeEach } from 'vitest'

// Solo se mockea lo que toca la DB: RAW_BUCKETS / RAW_BUCKET_LABEL / isRawBucket
// son puros y se dejan pasar, que son justo lo que decide el rango.
vi.mock('@ph/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ph/shared')>()),
  getApprovedByBucket: vi.fn(),
  getApprovedByCategory: vi.fn(),
  getNichesWithInventory: vi.fn().mockResolvedValue([
    'cama para perros', 'arena para gatos', 'acne', 'rodilla',
  ]),
  countApproved: vi.fn().mockResolvedValue(0),
  countRawPending: vi.fn().mockResolvedValue(0),
  getRawNicheStatus: vi.fn().mockResolvedValue({ id: 'acne', status: 'active' }),
  upsertRawNiche: vi.fn().mockResolvedValue(undefined),
  markSeen: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/product-hunter/session', () => ({
  readUserId: vi.fn().mockResolvedValue('user-1'),
  newUserId: () => 'user-nuevo',
  PH_USER_COOKIE: 'ph_uid',
}))

vi.mock('@/lib/product-hunter/entry', () => ({
  toEntry: (r: { page_id: string }) => ({ id: `acne:${r.page_id}`, adCount: 0 }),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'
import {
  getApprovedByBucket, getApprovedByCategory, getNichesWithInventory,
  countApproved, markSeen, type RawBucket,
} from '@ph/shared'

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/buscador-productos/search', {
    method: 'POST',
    body: JSON.stringify(body),
  })

// Devuelve n filas para los buckets listados, 0 para el resto.
function conStock(stock: Partial<Record<RawBucket, number>>) {
  vi.mocked(getApprovedByBucket).mockImplementation(async (_n, bucket) =>
    Array.from({ length: stock[bucket] ?? 0 }, (_, i) => ({ page_id: `p${bucket}${i}` }) as never),
  )
}

describe('POST /api/buscador-productos/search — un rango a la vez', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sin bucket: autoelige el rango MÁS alto que tenga stock y no consulta los de abajo', async () => {
    conStock({ '100+': 3, '50-100': 5 })
    const data = await (await POST(req({ niche: 'acne' }))).json()

    expect(data.status).toBe('ready')
    expect(data.groups).toHaveLength(1)
    expect(data.groups[0].bucket).toBe('100+')
    expect(data.total).toBe(3)
    expect(vi.mocked(getApprovedByBucket)).toHaveBeenCalledTimes(1)
  })

  it('sin bucket: si el rango alto está vacío cae al siguiente con stock', async () => {
    conStock({ '0-50': 4 })
    const data = await (await POST(req({ niche: 'acne' }))).json()

    expect(data.groups[0].bucket).toBe('0-50')
    expect(data.total).toBe(4)
    expect(vi.mocked(getApprovedByBucket)).toHaveBeenCalledTimes(3)
  })

  it('con bucket: sirve ESE rango aunque otro tenga más', async () => {
    conStock({ '100+': 9, '0-50': 2 })
    const data = await (await POST(req({ niche: 'acne', bucket: '0-50' }))).json()

    expect(data.groups[0].bucket).toBe('0-50')
    expect(data.total).toBe(2)
    expect(vi.mocked(getApprovedByBucket)).toHaveBeenCalledTimes(1)
  })

  it('bucket vacío pero el nicho tiene inventario: ready con el grupo vacío (la UI deja el filtro a la vista)', async () => {
    conStock({ '100+': 9 })
    vi.mocked(countApproved).mockResolvedValue(400)
    const data = await (await POST(req({ niche: 'acne', bucket: '0-50' }))).json()

    expect(data.status).toBe('ready')
    expect(data.groups[0].bucket).toBe('0-50')
    expect(data.total).toBe(0)
  })

  it('bucket inválido: se ignora y se autoelige', async () => {
    conStock({ '100+': 2 })
    const data = await (await POST(req({ niche: 'acne', bucket: 'todos' }))).json()
    expect(data.groups[0].bucket).toBe('100+')
  })

  it('marca como vistos SOLO los del rango servido, no los 30 de los tres', async () => {
    conStock({ '100+': 3, '50-100': 5, '0-50': 7 })
    await POST(req({ niche: 'acne' }))

    expect(vi.mocked(markSeen)).toHaveBeenCalledWith('user-1', [
      'acne:p100+0', 'acne:p100+1', 'acne:p100+2',
    ])
  })
})

// La UI busca por categoría: la ruta traduce la categoría a la lista de nichos
// con inventario que le corresponden y sirve un rango sobre todos ellos.
describe('POST /api/buscador-productos/search — por categoría', () => {
  beforeEach(() => vi.clearAllMocks())

  const conStockCat = (stock: Partial<Record<RawBucket, number>>) =>
    vi.mocked(getApprovedByCategory).mockImplementation(async (_n, bucket) =>
      Array.from({ length: stock[bucket] ?? 0 }, (_, i) => ({ page_id: `p${bucket}${i}` }) as never),
    )

  it('resuelve la categoría a SUS nichos y no toca el path por nicho', async () => {
    conStockCat({ '100+': 2 })
    const data = await (await POST(req({ category: 'mascotas' }))).json()

    expect(data.status).toBe('ready')
    expect(data.niche).toBe('mascotas')
    expect(vi.mocked(getNichesWithInventory)).toHaveBeenCalled()
    // De los 4 nichos con inventario, solo los dos de mascotas.
    expect(vi.mocked(getApprovedByCategory).mock.calls[0][0])
      .toEqual(['cama para perros', 'arena para gatos'])
    expect(vi.mocked(getApprovedByBucket)).not.toHaveBeenCalled()
  })

  it('sin bucket: autoelige el rango más alto con stock', async () => {
    conStockCat({ '0-50': 3 })
    const data = await (await POST(req({ category: 'salud' }))).json()

    expect(data.groups[0].bucket).toBe('0-50')
    expect(data.total).toBe(3)
    expect(vi.mocked(getApprovedByCategory)).toHaveBeenCalledTimes(3)
  })

  it('con bucket explícito y sin stock: ready con el grupo vacío (deja el filtro a la vista)', async () => {
    conStockCat({ '100+': 5 })
    const data = await (await POST(req({ category: 'mascotas', bucket: '0-50' }))).json()

    expect(data.status).toBe('ready')
    expect(data.groups[0].bucket).toBe('0-50')
    expect(data.total).toBe(0)
  })

  it('sin stock en ningún rango: empty, y no marca nada como visto', async () => {
    conStockCat({})
    const data = await (await POST(req({ category: 'mascotas' }))).json()

    expect(data.status).toBe('empty')
    expect(vi.mocked(markSeen)).not.toHaveBeenCalled()
  })

  it('categoría inválida: cae al path por nicho', async () => {
    conStock({ '100+': 1 })
    const data = await (await POST(req({ category: 'inventada', niche: 'acne' }))).json()

    expect(data.niche).toBe('acne')
    expect(vi.mocked(getApprovedByBucket)).toHaveBeenCalled()
    expect(vi.mocked(getApprovedByCategory)).not.toHaveBeenCalled()
  })

  it('sin categoría ni nicho: 400', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })
})
