import { describe, it, expect, beforeAll } from 'vitest'
import { refUrls } from '@/lib/branding/effective-preset'
import { STYLE_PRESETS } from '@/lib/branding/style-presets'

beforeAll(() => { process.env.SUPABASE_URL = 'https://demo.supabase.co' })

describe('refUrls', () => {
  it('devuelve 5 URLs de storage por estilo, en el host del proyecto', () => {
    const firstId = Object.keys(STYLE_PRESETS)[0]
    const urls = refUrls(firstId)
    expect(urls).toHaveLength(5)
    expect(urls[0]).toMatch(/^https:\/\/demo\.supabase\.co\/storage\/v1\/object\/public\/ad-uploads\/branding-refs\//)
  })
})
