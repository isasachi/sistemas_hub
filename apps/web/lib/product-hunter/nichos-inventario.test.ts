import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@ph/shared', () => ({ getNichesWithInventory: vi.fn() }))

import { getNichesWithInventory } from '@ph/shared'
import { nichosConInventario, _resetNichosCache } from './nichos-inventario'

const rpc = vi.mocked(getNichesWithInventory)
const timeout = () => new Error('canceling statement due to statement timeout')
const TTL = 10 * 60_000

// `after` de mentira: guarda las tareas para correrlas cuando el test quiera,
// que es lo que pasa en prod (después de responder).
function programador() {
  const tareas: (() => Promise<unknown>)[] = []
  return {
    programar: (t: () => Promise<unknown>) => { tareas.push(t) },
    correr: () => Promise.all(tareas.splice(0).map((t) => t())),
  }
}

describe('nichosConInventario', () => {
  let mudo: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.useFakeTimers()
    rpc.mockReset()
    _resetNichosCache()
    mudo = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    mudo.mockRestore()
  })

  it('un solo RPC para búsquedas seguidas y simultáneas', async () => {
    rpc.mockResolvedValue(['acne'])
    await Promise.all([nichosConInventario(), nichosConInventario()])
    expect(await nichosConInventario()).toEqual(['acne'])
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('vencida: sirve la vieja AL TOQUE y refresca en segundo plano', async () => {
    const s = programador()
    rpc.mockResolvedValueOnce(['acne']).mockResolvedValueOnce(['acne', 'yoga'])
    await nichosConInventario(s.programar)
    vi.advanceTimersByTime(TTL + 1)

    // No espera el RPC: devuelve la vieja y deja el refresco programado.
    expect(await nichosConInventario(s.programar)).toEqual(['acne'])
    expect(rpc).toHaveBeenCalledTimes(1)
    await s.correr()
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(await nichosConInventario(s.programar)).toEqual(['acne', 'yoga'])
  })

  it('si el refresco da timeout, sigue la vieja y no reintenta en cada request', async () => {
    const s = programador()
    rpc.mockResolvedValueOnce(['acne']).mockRejectedValueOnce(timeout()).mockResolvedValue(['yoga'])
    await nichosConInventario(s.programar)
    vi.advanceTimersByTime(TTL + 1)

    expect(await nichosConInventario(s.programar)).toEqual(['acne'])
    await s.correr()
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(mudo).toHaveBeenCalled()

    // Dentro de la ventana de reintento: la vieja, sin RPC nuevo.
    expect(await nichosConInventario(s.programar)).toEqual(['acne'])
    await s.correr()
    expect(rpc).toHaveBeenCalledTimes(2)

    // Pasada la ventana, reintenta.
    vi.advanceTimersByTime(60_000 + 1)
    await nichosConInventario(s.programar)
    await s.correr()
    expect(rpc).toHaveBeenCalledTimes(3)
    expect(await nichosConInventario(s.programar)).toEqual(['yoga'])
  })

  it('una lista VACÍA no reemplaza a la buena', async () => {
    const s = programador()
    rpc.mockResolvedValueOnce(['acne']).mockResolvedValueOnce([])
    await nichosConInventario(s.programar)
    vi.advanceTimersByTime(TTL + 1)
    await nichosConInventario(s.programar)
    await s.correr()
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(await nichosConInventario(s.programar)).toEqual(['acne'])
  })

  it('sin lista buena el error sube y la request siguiente reintenta', async () => {
    rpc.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(['acne'])
    await expect(nichosConInventario()).rejects.toThrow('statement timeout')
    expect(await nichosConInventario()).toEqual(['acne'])
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
