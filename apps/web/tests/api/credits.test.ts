import { describe, expect, it, vi, beforeEach } from 'vitest'

// La ruta existe solo para que el contador de la barra pueda releerse: el layout de `(app)` no
// se vuelve a renderizar al navegar entre tools. Lo que se prueba acá es el contrato con el
// cliente, que es donde se puede romper sin que nadie lo note — el pill descarta cualquier
// respuesta sin números y se queda con el último valor bueno, así que una ruta que devuelva la
// forma equivocada se ve EXACTAMENTE igual que el bug que vino a arreglar (número congelado).
const currentCreditStatus = vi.fn()
vi.mock('@/lib/credits', () => ({ currentCreditStatus: () => currentCreditStatus() }))

import { GET } from '@/app/api/credits/route'

beforeEach(() => currentCreditStatus.mockReset())

describe('GET /api/credits', () => {
  it('devuelve restantes y limite como números', async () => {
    currentCreditStatus.mockResolvedValue({ tier: 3, limite: 180, usados: 12, restantes: 168, desde: '2026-09-01' })
    const body = await (await GET()).json()
    expect(body).toEqual({ restantes: 168, limite: 180 })
  })

  // Sin sesión NO es un error: la barra solo informa. Un 401 acá haría ruido en la consola de
  // cada visitante sin sesión sin cambiar nada de lo que se ve.
  it('sin sesión devuelve un objeto vacío, no un error', async () => {
    currentCreditStatus.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })
})
