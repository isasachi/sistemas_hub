import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@ph/shared', () => ({ getNichesWithInventory: vi.fn() }))

import { getNichesWithInventory } from '@ph/shared'
import { nichosConInventario, _resetNichosCache } from './nichos-inventario'

const rpc = vi.mocked(getNichesWithInventory)
const timeout = () => new Error('canceling statement due to statement timeout')

describe('nichosConInventario', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    rpc.mockReset()
    _resetNichosCache()
  })
  afterEach(() => vi.useRealTimers())

  it('un solo RPC para búsquedas seguidas y simultáneas', async () => {
    rpc.mockResolvedValue(['acne'])
    await Promise.all([nichosConInventario(), nichosConInventario()])
    expect(await nichosConInventario()).toEqual(['acne'])
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('vencido el TTL, vuelve a pedir la lista', async () => {
    rpc.mockResolvedValueOnce(['acne']).mockResolvedValueOnce(['acne', 'yoga'])
    await nichosConInventario()
    vi.advanceTimersByTime(10 * 60_000 + 1)
    expect(await nichosConInventario()).toEqual(['acne', 'yoga'])
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('si el refresco da timeout, sirve la última lista buena', async () => {
    const mudo = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValueOnce(['acne']).mockRejectedValueOnce(timeout())
    await nichosConInventario()
    vi.advanceTimersByTime(10 * 60_000 + 1)
    expect(await nichosConInventario()).toEqual(['acne'])
    mudo.mockRestore()
  })

  it('sin lista buena el error sube y NO queda cacheado', async () => {
    rpc.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(['acne'])
    await expect(nichosConInventario()).rejects.toThrow('statement timeout')
    expect(await nichosConInventario()).toEqual(['acne'])
  })
})
