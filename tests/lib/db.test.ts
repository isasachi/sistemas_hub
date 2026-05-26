import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionResponse } from '@/lib/types'

const { mockSingle, mockFrom } = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockFrom = vi.fn(() => ({
    insert: vi.fn(() => ({ select: vi.fn(() => ({ single: mockSingle })) })),
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
    update: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single: mockSingle })) })) })),
  }))
  return { mockSingle, mockFrom }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('createSession', () => {
  it('returns session id', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'abc-123' }, error: null })
    const { createSession } = await import('@/lib/db')
    const id = await createSession()
    expect(id).toBe('abc-123')
  })

  it('throws on error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const { createSession } = await import('@/lib/db')
    await expect(createSession()).rejects.toThrow('DB error')
  })
})

describe('getSession', () => {
  it('returns session data', async () => {
    const fakeSession: Partial<SessionResponse> = { id: 's1', step: 0 }
    mockSingle.mockResolvedValue({ data: fakeSession, error: null })
    const { getSession } = await import('@/lib/db')
    const session = await getSession('s1')
    expect(session?.id).toBe('s1')
  })

  it('returns null on error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const { getSession } = await import('@/lib/db')
    const session = await getSession('bad-id')
    expect(session).toBeNull()
  })
})

describe('updateSession', () => {
  it('resolves without error on success', async () => {
    mockSingle.mockResolvedValue({ data: { id: 's1', step: 1 }, error: null })
    const { updateSession } = await import('@/lib/db')
    await expect(updateSession('s1', { step: 1 })).resolves.toBeUndefined()
  })
})
