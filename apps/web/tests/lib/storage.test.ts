import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockUpload, mockGetPublicUrl, mockFetch } = vi.hoisted(() => {
  const mockUpload = vi.fn()
  const mockGetPublicUrl = vi.fn()
  const mockFetch = vi.fn()
  return { mockUpload, mockGetPublicUrl, mockFetch }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  })),
}))

vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
})

describe('uploadToStorage', () => {
  it('uploads buffer and returns public URL', async () => {
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/ad-uploads/s1/reference.jpg' },
    })
    const { uploadToStorage } = await import('@/lib/storage')
    const buf = Buffer.from('image-bytes')
    const url = await uploadToStorage('s1', buf, 'image/jpeg', 'reference')
    expect(url).toContain('reference.jpg')
    expect(mockUpload).toHaveBeenCalledWith(
      's1/reference.jpg',
      buf,
      { contentType: 'image/jpeg', upsert: true }
    )
  })

  it('throws if upload fails', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'quota exceeded' } })
    const { uploadToStorage } = await import('@/lib/storage')
    await expect(
      uploadToStorage('s1', Buffer.from('x'), 'image/jpeg', 'ref')
    ).rejects.toThrow('Storage upload failed')
  })
})

describe('fetchAsBase64', () => {
  it('returns base64 and mimeType from URL', async () => {
    const src = Buffer.from('fake-image')
    const ab = new ArrayBuffer(src.length)
    new Uint8Array(ab).set(src)
    const fakeBytes = Buffer.from(ab)
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: vi.fn(() => 'image/png') },
      arrayBuffer: vi.fn().mockResolvedValue(ab),
    })
    const { fetchAsBase64 } = await import('@/lib/storage')
    const result = await fetchAsBase64('https://test.supabase.co/storage/v1/object/public/ad-uploads/s1/img.png')
    expect(result.mimeType).toBe('image/png')
    expect(result.data).toBe(fakeBytes.toString('base64'))
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 })
    const { fetchAsBase64 } = await import('@/lib/storage')
    await expect(fetchAsBase64('https://test.supabase.co/img.jpg')).rejects.toThrow('Failed to fetch image')
  })

  it('rechaza URLs fuera del host del bucket (anti-SSRF)', async () => {
    const { fetchAsBase64 } = await import('@/lib/storage')
    await expect(fetchAsBase64('https://evil.example.com/internal')).rejects.toThrow('non-storage URL')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
