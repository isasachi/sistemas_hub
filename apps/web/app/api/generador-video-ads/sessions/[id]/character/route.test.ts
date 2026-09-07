import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(),
}))
vi.mock('@/lib/gemini', () => ({ callStructured: vi.fn() }))
vi.mock('@/lib/llm-openai', () => ({ openaiGenerateImage: vi.fn() }))
vi.mock('@/lib/storage', () => ({
  uploadToStorage: vi.fn().mockResolvedValue('https://x.supabase.co/avatar-nuevo.png'),
  fetchAsBase64: vi.fn().mockResolvedValue({ data: 'YQ==', mimeType: 'image/png' }),
}))
vi.mock('@/lib/gen-quota', () => ({
  checkGenQuota: vi.fn(),
  recordGenQuota: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/product-hunter/session', () => ({ readUserId: vi.fn().mockResolvedValue('u1') }))

import { NextRequest } from 'next/server'
import { POST } from './route'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { callStructured } from '@/lib/gemini'
import { openaiGenerateImage } from '@/lib/llm-openai'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import type { VideoSessionResponse } from '@/lib/video-ads/types'

const IDENTIDAD = {
  promptCreacion: 'Retrato vertical 9:16 de una mujer...',
  bloqueConsistencia: 'Mujer de 27, cabello castaño...',
  perfilVocal: 'mujer-joven' as const,
  acento: 'Español peruano de Lima',
}

function req(body: unknown = {}) {
  return new NextRequest('http://localhost/api/generador-video-ads/sessions/s1/character', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
const ctx = () => ({ params: Promise.resolve({ id: 's1' }) })

function session(over: Partial<VideoSessionResponse> = {}): VideoSessionResponse {
  return {
    id: 's1',
    forensic_analysis: { sujeto: 'Mujer joven', vestuario: 'Polo', fondo: 'Dormitorio' },
    character_url: null, avatar_url: null, consistency_block: null, voice_profile: null,
    product_name: 'Serum', what_it_does: 'Suero', target_audience: 'Mujeres 20-35',
    angle: 'Testimonio', problem: 'Acné', constraints: null,
    ...over,
  } as unknown as VideoSessionResponse
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkGenQuota).mockResolvedValue({ blocked: null, regensLeft: 3 })
  vi.mocked(callStructured).mockResolvedValue(IDENTIDAD as never)
  vi.mocked(openaiGenerateImage).mockResolvedValue('YXZhdGFy')
})

describe('POST character', () => {
  // El disparo en segundo plano ocurre ANTES de que `/inputs` persista la foto, así que
  // la URL tiene que poder llegar por el body: sin esto la ruta generaría un avatar sin
  // ninguna referencia, en silencio.
  it('acepta la foto por el body cuando la fila todavía no la tiene', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())

    const res = await POST(req({ characterUrl: 'https://x.supabase.co/foto-A.png' }), ctx())
    expect(res.status).toBe(200)
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({
      character_url: 'https://x.supabase.co/foto-A.png',
      avatar_url: 'https://x.supabase.co/avatar-nuevo.png',
    }))
  })

  it('sin foto por ningún lado, 409 sin gastar cuota', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())
    const res = await POST(req(), ctx())
    expect(res.status).toBe(409)
    expect(checkGenQuota).not.toHaveBeenCalled()
    expect(openaiGenerateImage).not.toHaveBeenCalled()
  })

  // El paso del guión reintenta siempre; si eso cobrara, el disparo en segundo plano
  // le costaría al usuario una regeneración de su tope de 1+3 por acertar la caché.
  it('ya construido para ESA foto: devuelve lo guardado sin cobrar ni regenerar', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({
      character_url: 'https://x/foto-A.png', avatar_url: 'https://x/avatar-A.png',
      consistency_block: 'bloque', voice_profile: { acento: 'x' } as never,
    }))

    const res = await POST(req({ characterUrl: 'https://x/foto-A.png' }), ctx())
    expect(await res.json()).toMatchObject({ avatarUrl: 'https://x/avatar-A.png' })
    expect(checkGenQuota).not.toHaveBeenCalled()
    expect(openaiGenerateImage).not.toHaveBeenCalled()
    expect(recordGenQuota).not.toHaveBeenCalled()
  })

  // El caso que la caché sin comparar la foto rompía en silencio: el usuario cambia la
  // foto y se queda con el avatar de la anterior, con la fila afirmando que salió de la
  // nueva y el render usando la vieja.
  it('foto NUEVA: regenera aunque ya haya un avatar guardado', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({
      character_url: 'https://x/foto-A.png', avatar_url: 'https://x/avatar-A.png',
      consistency_block: 'bloque', voice_profile: { acento: 'x' } as never,
    }))

    const res = await POST(req({ characterUrl: 'https://x/foto-B.png' }), ctx())
    expect(res.status).toBe(200)
    expect(openaiGenerateImage).toHaveBeenCalled()
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({
      character_url: 'https://x/foto-B.png',
      avatar_url: 'https://x.supabase.co/avatar-nuevo.png',
    }))
  })

  // La voz no la escribe el modelo: elige uno de los cuatro perfiles fijos y solo el
  // acento sale de él.
  it('guarda el perfil vocal estándar con el acento inferido dentro', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({ character_url: 'https://x/foto-A.png' }))

    await POST(req(), ctx())
    const patch = vi.mocked(updateVideoSession).mock.calls[0][1] as { voice_profile: { acento: string; edadVocal: string } }
    expect(patch.voice_profile.acento).toBe('Español peruano de Lima')
    expect(patch.voice_profile.edadVocal).toBe('25-35 años')
  })

  it('pide la imagen en 9:16', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({ character_url: 'https://x/foto-A.png' }))
    await POST(req(), ctx())
    expect(openaiGenerateImage).toHaveBeenCalledWith(expect.anything(), 2, { aspectRatio: '9:16' })
  })
})
