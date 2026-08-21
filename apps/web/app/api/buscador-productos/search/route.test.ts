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
}))

vi.mock('@/lib/product-hunter/entry', () => ({
  toEntry: (r: { page_id: string }) => ({ id: `acne:${r.page_id}`, adCount: 0 }),
}))

// La ruta autentica por su cuenta para saber el PLAN (qué rangos y cuántos
// productos sirve). Por defecto se corre como plan 3 — el que no recorta nada —
// para que los tests de serving midan el serving y no el gate; los del gate
// cambian el tier a propósito.
vi.mock('@/lib/supabase/server', () => ({
  getUser: vi.fn().mockResolvedValue({ id: 'u1', email: 'u@jrhub.pe' }),
}))
vi.mock('@/lib/whop', () => ({
  getAccess: vi.fn().mockResolvedValue({ tier: 3, status: 'active', renewalPeriodEnd: null, grandfathered: false, bajaA: null }),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'
import {
  getApprovedByBucket, getApprovedByCategory, getNichesWithInventory,
  countApproved, PLANS, type RawBucket, type Tier,
} from '@ph/shared'
import { getAccess } from '@/lib/whop'
import { getUser } from '@/lib/supabase/server'

/** Corre el resto del test como si el usuario tuviera este plan. */
function conPlan(tier: Tier) {
  vi.mocked(getAccess).mockResolvedValue({ tier, status: 'active', renewalPeriodEnd: null, grandfathered: false, bajaA: null })
}

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
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'u@jrhub.pe' } as never)
    conPlan(3)
  })

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

  // Reemplaza al viejo test de `markSeen`: ya no hay economía del visto, así que
  // lo que hay que sostener es lo contrario — la misma consulta devuelve lo
  // mismo, sin cookie ni estado por usuario.
  it('la misma consulta dos veces devuelve exactamente lo mismo', async () => {
    conStock({ '100+': 3 })
    const a = await (await POST(req({ niche: 'acne' }))).json()
    const b = await (await POST(req({ niche: 'acne' }))).json()

    expect(b.groups[0].products).toEqual(a.groups[0].products)
    expect(vi.mocked(getApprovedByBucket).mock.calls[0]).toEqual(
      vi.mocked(getApprovedByBucket).mock.calls[1],
    )
  })

  it('no setea cookie de usuario: el serving no es personalizado', async () => {
    conStock({ '100+': 1 })
    const res = await POST(req({ niche: 'acne' }))
    expect(res.cookies.getAll()).toHaveLength(0)
  })

  it('pide 50 productos por rango (la UI los pagina de a 10)', async () => {
    conStock({ '100+': 3 })
    await POST(req({ niche: 'acne' }))
    expect(vi.mocked(getApprovedByBucket).mock.calls[0][2]).toBe(50)
  })
})

// La UI busca por categoría: la ruta traduce la categoría a la lista de nichos
// con inventario que le corresponden y sirve un rango sobre todos ellos.
describe('POST /api/buscador-productos/search — por categoría', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'u@jrhub.pe' } as never)
    conPlan(3)
  })

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

  it('sin stock en ningún rango: empty', async () => {
    conStockCat({})
    const data = await (await POST(req({ category: 'mascotas' }))).json()
    expect(data.status).toBe('empty')
  })

  // El invariante que importa: este es el path que usa la UI. Si alguien vuelve
  // a meter estado por usuario, se cae acá.
  it('la misma categoría dos veces devuelve exactamente lo mismo', async () => {
    conStockCat({ '100+': 50 })
    const a = await (await POST(req({ category: 'mascotas' }))).json()
    const res = await POST(req({ category: 'mascotas' }))
    const b = await res.json()

    expect(b.groups[0].products).toEqual(a.groups[0].products)
    expect(res.cookies.getAll()).toHaveLength(0)
    expect(vi.mocked(getApprovedByCategory).mock.calls[0]).toEqual(
      vi.mocked(getApprovedByCategory).mock.calls[1],
    )
  })

  it('pide 50 productos de la categoría', async () => {
    conStockCat({ '100+': 50 })
    const data = await (await POST(req({ category: 'mascotas' }))).json()
    expect(vi.mocked(getApprovedByCategory).mock.calls[0][2]).toBe(50)
    expect(data.total).toBe(50)
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

describe('POST /api/buscador-productos/search — el plan decide qué se sirve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'u@jrhub.pe' } as never)
    vi.mocked(getApprovedByCategory).mockResolvedValue([])
    vi.mocked(getApprovedByBucket).mockResolvedValue([])
  })

  // El corazón del gate: el recorte ocurre EN EL SERVIDOR. Un candado pintado en
  // el cliente sobre 50 productos ya enviados no es un candado.
  it.each([1, 2, 3] as const)('el plan %i pide exactamente sus productos por rango', async (tier) => {
    conPlan(tier)
    await POST(req({ category: 'mascotas' }))
    expect(vi.mocked(getApprovedByCategory).mock.calls[0][2]).toBe(PLANS[tier].porRango)
  })

  it('un rango bloqueado NO consulta la base y devuelve el grupo vacío', async () => {
    conPlan(1)
    const data = await (await POST(req({ category: 'mascotas', bucket: '100+' }))).json()

    expect(vi.mocked(getApprovedByCategory)).not.toHaveBeenCalled()
    expect(data.groups[0].bucket).toBe('100+')
    expect(data.groups[0].products).toEqual([])
    expect(data.locked).toEqual(['50-100', '100+'])
  })

  // Sin esto el plan 1 abriría siempre en "100 a más", que es justo el rango que
  // no compró: la autoelección arranca por el más pautado.
  it('la autoelección no prueba rangos que el plan no desbloquea', async () => {
    conPlan(1)
    await POST(req({ category: 'mascotas' }))
    const probados = vi.mocked(getApprovedByCategory).mock.calls.map((c) => c[1])
    expect(probados).toEqual(['0-50'])
  })

  it('el plan 2 prueba sus dos rangos, del más alto al más bajo', async () => {
    conPlan(2)
    await POST(req({ category: 'mascotas' }))
    expect(vi.mocked(getApprovedByCategory).mock.calls.map((c) => c[1])).toEqual(['50-100', '0-50'])
  })

  // Sin sesión cae al plan más bajo, nunca al más alto.
  it('sin sesión se sirve como plan 1', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never)
    const data = await (await POST(req({ category: 'mascotas' }))).json()
    expect(data.tier).toBe(1)
    expect(vi.mocked(getApprovedByCategory).mock.calls[0][2]).toBe(PLANS[1].porRango)
  })

  it('con sesión pero sin suscripción también se sirve como plan 1', async () => {
    vi.mocked(getAccess).mockResolvedValue(null)
    const data = await (await POST(req({ category: 'mascotas' }))).json()
    expect(data.tier).toBe(1)
  })
})

describe('POST /api/buscador-productos/search — filtros globales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'u@jrhub.pe' } as never)
    conPlan(3)
    vi.mocked(getApprovedByCategory).mockResolvedValue([])
    vi.mocked(getApprovedByBucket).mockResolvedValue([])
  })

  it('pasa país y antigüedad a la consulta, en categoría y en nicho', async () => {
    await POST(req({ category: 'mascotas', country: 'PE', minDias: 30 }))
    expect(vi.mocked(getApprovedByCategory).mock.calls[0][3])
      .toEqual({ country: 'PE', minDias: 30 })

    await POST(req({ niche: 'acne', country: 'MX', minDias: 90 }))
    expect(vi.mocked(getApprovedByBucket).mock.calls[0][3])
      .toEqual({ country: 'MX', minDias: 90 })
  })

  // Un valor fuera de la lista cerrada se ignora en vez de romper la búsqueda —
  // y sobre todo, no llega a la query.
  it('ignora país y antigüedad inválidos', async () => {
    await POST(req({ category: 'mascotas', country: 'XX', minDias: 7 }))
    expect(vi.mocked(getApprovedByCategory).mock.calls[0][3])
      .toEqual({ country: null, minDias: null })
  })

  // Con un filtro puesto y el nicho con inventario, "0 resultados" es "afloja el
  // filtro", no "este nicho está vacío": la UI necesita `ready` para dejar los
  // filtros a la vista.
  it('nicho con inventario y filtro que no matchea: ready, no pending', async () => {
    vi.mocked(countApproved).mockResolvedValue(120)
    const data = await (await POST(req({ niche: 'acne', country: 'PE' }))).json()
    expect(data.status).toBe('ready')
    expect(data.total).toBe(0)
  })
})
