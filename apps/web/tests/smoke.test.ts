import { describe, it, expect } from 'vitest'

describe('env setup', () => {
  it('has required env vars', () => {
    expect(process.env.SUPABASE_URL).toBeDefined()
    expect(process.env.GOOGLE_API_KEY).toBeDefined()
  })
})
