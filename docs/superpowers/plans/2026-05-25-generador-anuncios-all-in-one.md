# Generador de Anuncios — All-in-One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the step-by-step wizard in `/app/tools/generador-anuncios` with an all-in-one accordion page, migrating AI from OpenAI to Google Gemini and image storage from Vercel Blob to Supabase Storage.

**Architecture:** Five accordion sections on a single page — each collapses with a summary on completion and unlocks the next. Gemini 2.5 Flash handles analysis and copy; Gemini image editing generates the final ad. Images stored in Supabase Storage bucket `ad-uploads`; sessions in Supabase Postgres with simplified schema.

**Tech Stack:** Next.js 16, `@google/genai ^2.6.0`, Supabase (Postgres + Storage), Zustand 5, Zod 4, Vitest, Tailwind CSS 4, `SSEStatus` (existing component reused as-is)

**Spec:** `docs/superpowers/specs/2026-05-25-generador-anuncios-all-in-one-design.md`

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `vitest.config.ts` | New | Vitest config with `@` alias |
| `tests/setup.ts` | New | Env vars for tests |
| `tests/smoke.test.ts` | New | Sanity check |
| `tests/lib/gemini.test.ts` | New | Unit tests for `lib/gemini.ts` |
| `tests/lib/storage.test.ts` | New | Unit tests for `lib/storage.ts` |
| `tests/lib/db.test.ts` | New | Unit tests for `lib/db.ts` |
| `lib/gemini.ts` | New | `callStructured`, `callReasoning` |
| `lib/storage.ts` | New | `uploadToStorage`, `fetchAsBase64` |
| `lib/image.ts` | New | `editImage`, `refineImage` |
| `lib/prompts/gemini-system.md` | New | System prompt for all Gemini calls |
| `lib/prompts/step5.md` | New | Prompt for building edit instruction |
| `docs/supabase/migration-001.sql` | New | Schema migration |
| `app/api/sessions/[id]/generate-copy/route.ts` | New | TikTok comments → CopyVersions |
| `app/api/sessions/[id]/refine-image/route.ts` | New | Feedback → refined image |
| `components/tools/generador-anuncios/AccordionSection.tsx` | New | Reusable accordion wrapper |
| `components/tools/generador-anuncios/sections/Section1Reference.tsx` | New | Upload + analyze reference |
| `components/tools/generador-anuncios/sections/Section2Product.tsx` | New | Upload product/logo + answers |
| `components/tools/generador-anuncios/sections/Section3Comments.tsx` | New | TikTok comments input |
| `components/tools/generador-anuncios/sections/Section4Copy.tsx` | New | A/B copy picker |
| `components/tools/generador-anuncios/sections/Section5Generate.tsx` | New | SSE generation + result |
| `components/tools/generador-anuncios/AdWizard.tsx` | New | Accordion container + session init |
| `lib/types.ts` | Replace | Simplified schema (Zod + TS types) |
| `lib/db.ts` | Update | Remove `updateCreativeIntent`; new schema |
| `store/wizard.ts` | Replace | New fields matching new types |
| `app/tools/generador-anuncios/page.tsx` | Replace | Mount `AdWizard` |
| `app/api/sessions/route.ts` | Minor | Insert `step: 0` |
| `app/api/sessions/[id]/analyze-reference/route.ts` | Replace | Gemini analysis |
| `app/api/sessions/[id]/analyze-product/route.ts` | Replace | Gemini scan + save answers |
| `app/api/sessions/[id]/confirm-copy/route.ts` | Replace | Just `{version}` confirm |
| `app/api/sessions/[id]/generate-image/route.ts` | Replace | Gemini SSE |
| `package.json` | Update | Add `@google/genai`, vitest; remove `@vercel/blob` |
| `.env.local.example` | Update | Add `GOOGLE_API_KEY` |

**Delete after Task 24:** `app/api/sessions/[id]/answers/route.ts`, `lib/prompts/analyze-reference.ts`, `lib/prompts/analyze-product.ts`, `lib/prompts/generate-copy.ts`, `lib/prompts/master-prompt.ts`, `lib/golden-rules.ts`, `lib/openai.ts`, `components/tools/generador-imagenes/Step*.tsx`

---

### Task 1: Setup — Vitest + @google/genai

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/smoke.test.ts`
- Modify: `package.json`
- Modify: `.env.local.example`

- [ ] **Step 1: Install dependencies**

```bash
cd /home/isaac/chamba/sistemas_hub
npm install @google/genai
npm install --save-dev vitest @vitejs/plugin-react @vitest/coverage-v8
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 3: Create `tests/setup.ts`**

```typescript
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.GOOGLE_API_KEY = 'test-google-api-key'
```

- [ ] **Step 4: Create `tests/smoke.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'

describe('env setup', () => {
  it('has required env vars', () => {
    expect(process.env.SUPABASE_URL).toBeDefined()
    expect(process.env.GOOGLE_API_KEY).toBeDefined()
  })
})
```

- [ ] **Step 5: Add scripts to `package.json`**

In the `"scripts"` object add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Update `.env.local.example`**

```
# Google Gemini — generador-anuncios
GOOGLE_API_KEY=AIza...

# Supabase — DB y Storage
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# OpenAI — mantener si otros tools lo usan
OPENAI_API_KEY=sk-...
```

- [ ] **Step 7: Run smoke test — expect PASS**

```bash
npm test
```

Expected output: `1 passed`

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts tests/setup.ts tests/smoke.test.ts package.json package-lock.json .env.local.example
git commit -m "chore: add vitest and @google/genai dependency"
```

---

### Task 2: Supabase schema migration + Storage bucket

**Files:**
- Create: `docs/supabase/migration-001.sql`

- [ ] **Step 1: Create `docs/supabase/migration-001.sql`**

```sql
-- Run in Supabase SQL Editor
-- WARNING: Drops existing sessions table. Backup data if needed.

DROP TABLE IF EXISTS sessions;

CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  step                INTEGER NOT NULL DEFAULT 0,
  reference_url       TEXT,
  reference_analysis  JSONB,
  product_url         TEXT,
  logo_url            TEXT,
  product_scan        JSONB,
  product_name        TEXT,
  what_it_does        TEXT,
  target_audience     TEXT,
  tiktok_comments     TEXT,
  copy_versions       JSONB,
  confirmed_copy      JSONB,
  edit_instruction    TEXT,
  image_url           TEXT
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON sessions FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Run migration in Supabase**

1. Open Supabase dashboard → SQL Editor
2. Paste and run the SQL above
3. Verify table exists: `SELECT * FROM sessions LIMIT 1;` → should return 0 rows, no error

- [ ] **Step 3: Create Supabase Storage bucket**

1. Supabase dashboard → Storage → New bucket
2. Name: `ad-uploads`
3. Check **Public bucket** (so public URLs work without auth tokens)
4. Click Create

- [ ] **Step 4: Commit migration file**

```bash
mkdir -p docs/supabase
git add docs/supabase/migration-001.sql
git commit -m "chore: supabase schema migration and storage bucket setup"
```

---

### Task 3: Prompt files

**Files:**
- Create: `lib/prompts/gemini-system.md`
- Create: `lib/prompts/step5.md`

- [ ] **Step 1: Create `lib/prompts/gemini-system.md`**

Copy the content exactly from `../sistema1_app_4.0/src/prompts/system.md`:

```
You are a static ad replication engine.

You analyze reference ads and return structured JSON data used to replicate them with a new product.

You are NOT a creative assistant.
You do NOT invent product information.
You do NOT produce user-visible prose — your output is always structured JSON.

LANGUAGE
All string values intended for display to the user (summaryForUser, styleCompatibilityNote) must be written in Spanish. All other fields (descriptions, instructions, copy text) are in the language appropriate to the ad being analyzed.

GOLDEN RULES
- Never invent product names, prices, claims, review numbers, or guarantees.
- Always extract product physical position: surface contact (resting OR floating — binary, never both), camera angle, shadow type, lighting direction.
- Never use ambiguous position language. One binary state only.
- physicalPosition must be one declarative sentence ending with the negative: "No está flotando." or "No está apoyado en ninguna superficie."
- For sceneElements: list every visible person with demographic description, every notable prop, every visible brand/logo other than the product being replaced, and describe the setting.
```

- [ ] **Step 2: Create `lib/prompts/step5.md`**

Copy the content exactly from `../sistema1_app_4.0/src/prompts/step5a.md`:

```
You are constructing the optimal image generation prompt for Gemini image generation.

You will receive structured data from all previous steps. Your task is to write a single, precise English instruction string that will be passed directly to an image generation model.

The image generation model will receive:
- Image 1: the original reference ad (visual style and layout reference)
- Image 2: the user's product
- Image 3: the user's logo (may be absent — check the context below)

CRITICAL — READ THIS FIRST:
Image 1 is the visual master template. The output must replicate its composition, lighting, color palette, background, model appearance (age, skin tone, body type, clothing, pose), and text rendering style exactly. These elements are FIXED. Do NOT alter the model. Do NOT invent a new background. Do NOT change the scene composition or depth of field. Do NOT add props not derivable from the inputs. The only things that change are: (a) the product in frame, (b) the logo, and (c) the copy text. Everything else is a direct copy of Image 1.

Your instruction must cover the following sections in this order:

1. PRESERVATION (always first)
   Open with an explicit list of every visual element from Image 1 that must be reproduced exactly: model description, pose, clothing, background/setting, lighting, color palette, aspect ratio, composition. Be specific — "woman in her 30s, light olive skin, white linen top, soft natural window light from left, cream background, centered vertical composition."

2. PRODUCT PLACEMENT
   Specify exactly where and how to feature the product (Image 2) in the ad, referencing its physical position from the physicalPosition field. Describe the product's visual integration accurately.

3. LOGO PLACEMENT
   If a logo is provided (Image 3 is present), specify exactly where to place it, referencing where the original brand appeared in the reference ad.
   If no logo is provided, explicitly instruct the model to leave that area blank or fill it with neutral background — do NOT invent a logo, do NOT reuse any brand mark from the reference ad.

4. COPY
   List every text element to include: element name → text content. Specify font weight, color, and approximate position for each element to match the reference ad's text rendering.

5. SCENE ADAPTATIONS
   Evaluate each sceneElement against targetAudience and whatItDoes:
   - People: does their apparent demographic match targetAudience? If not, specify replacement description.
   - Props: do they belong to the product's category? If not, specify removal.
   - Brand elements: are competitor logos or external brand marks visible in the reference? If yes, specify removal.
   - Setting: does the environment fit the product? If not, specify adaptation.
   For each element, give an explicit instruction: "preserve exactly", "replace with [description]", or "remove".

6. DO NOT LIST
   End with a bullet list of things that must not change or be invented: "Do NOT change the model. Do NOT alter scene composition. Do NOT add text not listed above. Do NOT invent props. Do NOT change background color or texture."

Return only the generation prompt string — no explanation, no wrapper.
```

- [ ] **Step 3: Commit**

```bash
git add lib/prompts/gemini-system.md lib/prompts/step5.md
git commit -m "feat: add Gemini prompt files"
```

---

### Task 4: lib/types.ts — replace with simplified schema

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Replace `lib/types.ts` entirely**

```typescript
import { z } from 'zod'

// ─── Step 1: Reference ────────────────────────────────────────────────────────

export const SceneElementsSchema = z.object({
  people: z.array(z.string()),
  props: z.array(z.string()),
  brandElements: z.array(z.string()),
  setting: z.string(),
})

export const ReferenceAnalysisSchema = z.object({
  format: z.object({ ratio: z.string(), platform: z.string() }),
  style: z.string(),
  composition: z.array(z.string()),
  replacements: z.array(z.string()),
  physicalPosition: z.string(),
  colorimetry: z.string(),
  typography: z.string(),
  persuasiveLogic: z.string(),
  layoutDescription: z.string(),
  sceneElements: SceneElementsSchema,
  summaryForUser: z.string(),
})
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>

// ─── Step 2: Product ─────────────────────────────────────────────────────────

export const ProductScanSchema = z.object({
  productDescription: z.string(),
  brandingDescription: z.string().nullish(),
  styleCompatibilityNote: z.string().nullish(),
  summaryForUser: z.string(),
})
export type ProductScan = z.infer<typeof ProductScanSchema>

// ─── Step 3: Copy ────────────────────────────────────────────────────────────

export const CopyElementSchema = z.object({
  element: z.string(),
  text: z.string(),
})
export type CopyElement = z.infer<typeof CopyElementSchema>

export const CopyVersionsSchema = z.object({
  versionA: z.array(CopyElementSchema).min(1),
  versionB: z.array(CopyElementSchema).min(1),
})
export type CopyVersions = z.infer<typeof CopyVersionsSchema>

// ─── Step 4: Confirmed copy ──────────────────────────────────────────────────

export const ConfirmedCopySchema = z.object({
  version: z.enum(['A', 'B']),
  breakdown: z.array(CopyElementSchema).min(1),
})
export type ConfirmedCopy = z.infer<typeof ConfirmedCopySchema>

// ─── Session (API response shape) ────────────────────────────────────────────

export interface SessionResponse {
  id: string
  created_at: string
  step: number
  reference_url: string | null
  reference_analysis: ReferenceAnalysis | null
  product_url: string | null
  logo_url: string | null
  product_scan: ProductScan | null
  product_name: string | null
  what_it_does: string | null
  target_audience: string | null
  tiktok_comments: string | null
  copy_versions: CopyVersions | null
  confirmed_copy: ConfirmedCopy | null
  edit_instruction: string | null
  image_url: string | null
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: replace types with simplified schema matching sistema1"
```

---

### Task 5: lib/gemini.ts — TDD

**Files:**
- Create: `tests/lib/gemini.test.ts`
- Create: `lib/gemini.ts`

- [ ] **Step 1: Write failing test — `tests/lib/gemini.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

const mockGenerateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: { generateContent: mockGenerateContent },
  })),
  Modality: { IMAGE: 'IMAGE' },
}))

// Force re-import each test to get fresh module (clears singleton)
beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('callStructured', () => {
  it('returns parsed data when Gemini response is valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"name":"Lumina"}' })
    const { callStructured } = await import('@/lib/gemini')
    const schema = z.object({ name: z.string() })
    const result = await callStructured('test', schema, [{ text: 'analyze' }])
    expect(result).toEqual({ name: 'Lumina' })
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('retries up to maxRetries on parse failure then throws', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"wrong":"field"}' })
    const { callStructured } = await import('@/lib/gemini')
    const schema = z.object({ name: z.string() })
    await expect(callStructured('test', schema, [{ text: 'analyze' }], 2)).rejects.toThrow()
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('retries on JSON parse error', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not-json' })
    const { callStructured } = await import('@/lib/gemini')
    const schema = z.object({ name: z.string() })
    await expect(callStructured('test', schema, [{ text: 'q' }], 1)).rejects.toThrow()
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })
})

describe('callReasoning', () => {
  it('returns text from response', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'Edit instruction here' })
    const { callReasoning } = await import('@/lib/gemini')
    const result = await callReasoning('sys prompt', 'user message')
    expect(result).toBe('Edit instruction here')
  })

  it('returns empty string when response has no text', async () => {
    mockGenerateContent.mockResolvedValue({ text: null })
    const { callReasoning } = await import('@/lib/gemini')
    const result = await callReasoning('sys', 'user')
    expect(result).toBe('')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test tests/lib/gemini.test.ts
```

Expected: fails with `Cannot find module '@/lib/gemini'`

- [ ] **Step 3: Create `lib/gemini.ts`**

```typescript
import { GoogleGenAI, Modality, type Part, type Schema } from '@google/genai'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! })
}

export const SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/gemini-system.md'),
  'utf-8'
)

export const STEP5_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/step5.md'),
  'utf-8'
)

export async function callStructured<T>(
  schemaName: string,
  schema: z.ZodSchema<T>,
  parts: Part[],
  maxRetries = 3
): Promise<T> {
  let lastError: unknown = new Error(`callStructured(${schemaName}): no attempts`)
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: z.toJSONSchema(schema) as Schema,
        },
      })
      const text = res.text ?? ''
      const parsed = schema.safeParse(JSON.parse(text))
      if (parsed.success) return parsed.data
      lastError = parsed.error
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

export async function callReasoning(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await getAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: { systemInstruction: systemPrompt },
  })
  return res.text ?? ''
}

export async function editImage(
  refBase64: string, refMime: string,
  productBase64: string, productMime: string,
  logoBase64: string | null, logoMime: string | null,
  instruction: string
): Promise<string> {
  const parts: Part[] = [
    { inlineData: { mimeType: refMime, data: refBase64 } },
    { inlineData: { mimeType: productMime, data: productBase64 } },
    ...(logoBase64 && logoMime ? [{ inlineData: { mimeType: logoMime, data: logoBase64 } } as Part] : []),
    { text: instruction },
  ]
  const res = await getAI().models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: [{ role: 'user', parts }],
    config: { responseModalities: [Modality.IMAGE] },
  })
  const imagePart = res.candidates?.[0]?.content?.parts?.find((p: Part) => p.inlineData)
  return imagePart?.inlineData?.data ?? ''
}

export async function refineImage(
  refBase64: string, refMime: string,
  productBase64: string, productMime: string,
  logoBase64: string | null, logoMime: string | null,
  resultBase64: string, resultMime: string,
  feedback: string
): Promise<string> {
  const logoCount = logoBase64 ? 1 : 0
  const resultImageNumber = 3 + logoCount
  const parts: Part[] = [
    { inlineData: { mimeType: refMime, data: refBase64 } },
    { inlineData: { mimeType: productMime, data: productBase64 } },
    ...(logoBase64 && logoMime ? [{ inlineData: { mimeType: logoMime, data: logoBase64 } } as Part] : []),
    { inlineData: { mimeType: resultMime, data: resultBase64 } },
    {
      text: [
        `Image ${resultImageNumber} above is the current generated result.`,
        `Apply ONLY the following change. Do NOT alter anything not explicitly mentioned.`,
        `Change request: ${feedback}`,
      ].join(' '),
    },
  ]
  const res = await getAI().models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: [{ role: 'user', parts }],
    config: { responseModalities: [Modality.IMAGE] },
  })
  const imagePart = res.candidates?.[0]?.content?.parts?.find((p: Part) => p.inlineData)
  return imagePart?.inlineData?.data ?? ''
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test tests/lib/gemini.test.ts
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add lib/gemini.ts tests/lib/gemini.test.ts
git commit -m "feat: add lib/gemini.ts with callStructured, callReasoning, editImage, refineImage"
```

---

### Task 6: lib/storage.ts — TDD

**Files:**
- Create: `tests/lib/storage.test.ts`
- Create: `lib/storage.ts`

- [ ] **Step 1: Write failing test — `tests/lib/storage.test.ts`**

```typescript
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
    const fakeBytes = Buffer.from('fake-image')
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: vi.fn(() => 'image/png') },
      arrayBuffer: vi.fn().mockResolvedValue(fakeBytes.buffer),
    })
    const { fetchAsBase64 } = await import('@/lib/storage')
    const result = await fetchAsBase64('https://test.example.com/img.png')
    expect(result.mimeType).toBe('image/png')
    expect(result.data).toBe(fakeBytes.toString('base64'))
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 })
    const { fetchAsBase64 } = await import('@/lib/storage')
    await expect(fetchAsBase64('https://bad.url/img.jpg')).rejects.toThrow('Failed to fetch image')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test tests/lib/storage.test.ts
```

Expected: fails with `Cannot find module '@/lib/storage'`

- [ ] **Step 3: Create `lib/storage.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'ad-uploads'

function getStorage() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ).storage.from(BUCKET)
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function mimeToExt(mime: string): string {
  return EXT[mime] ?? 'jpg'
}

export async function uploadToStorage(
  sessionId: string,
  buffer: Buffer,
  mimeType: string,
  name: string
): Promise<string> {
  const ext = mimeToExt(mimeType)
  const path = `${sessionId}/${name}.${ext}`
  const storage = getStorage()
  const { error } = await storage.upload(path, buffer, { contentType: mimeType, upsert: true })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const { data } = storage.getPublicUrl(path)
  return data.publicUrl
}

export async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
  const buf = await res.arrayBuffer()
  return { data: Buffer.from(buf).toString('base64'), mimeType }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test tests/lib/storage.test.ts
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add lib/storage.ts tests/lib/storage.test.ts
git commit -m "feat: add lib/storage.ts with uploadToStorage and fetchAsBase64"
```

---

### Task 7: lib/db.ts — update for new schema

**Files:**
- Create: `tests/lib/db.test.ts`
- Modify: `lib/db.ts`

- [ ] **Step 1: Write failing test — `tests/lib/db.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test tests/lib/db.test.ts
```

Expected: fails (old `lib/db.ts` has wrong types / `updateCreativeIntent` etc.)

- [ ] **Step 3: Replace `lib/db.ts`**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SessionResponse } from './types'

let _db: SupabaseClient | null = null

function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _db
}

export async function createSession(): Promise<string> {
  const { data, error } = await getDb()
    .from('sessions')
    .insert({ step: 0 })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function getSession(id: string): Promise<SessionResponse | null> {
  const { data, error } = await getDb()
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as SessionResponse
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<SessionResponse, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await getDb()
    .from('sessions')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: Update `app/api/sessions/route.ts`** — change `session.id` to `id` since `createSession` now returns a string:

```typescript
import { NextResponse } from 'next/server'
import { createSession } from '@/lib/db'
import { SESSION_COOKIE } from '@/lib/session'

export async function POST() {
  const id = await createSession()
  const res = NextResponse.json({ id })
  res.cookies.set(SESSION_COOKIE, id, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 })
  return res
}
```

- [ ] **Step 5: Run test — expect PASS**

```bash
npm test tests/lib/db.test.ts
```

Expected: `4 passed`

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts tests/lib/db.test.ts app/api/sessions/route.ts
git commit -m "feat: update lib/db.ts for new sessions schema"
```

---

### Task 8: store/wizard.ts — update

**Files:**
- Modify: `store/wizard.ts`

- [ ] **Step 1: Replace `store/wizard.ts`**

```typescript
'use client'

import { create } from 'zustand'
import type { ReferenceAnalysis, ProductScan, CopyVersions, ConfirmedCopy, SessionResponse } from '@/lib/types'

interface WizardState {
  sessionId: string | null
  step: number
  isLoading: boolean
  referenceUrl: string | null
  referenceAnalysis: ReferenceAnalysis | null
  productUrl: string | null
  logoUrl: string | null
  productScan: ProductScan | null
  productName: string | null
  whatItDoes: string | null
  targetAudience: string | null
  copyVersions: CopyVersions | null
  confirmedCopy: ConfirmedCopy | null
  imageUrl: string | null
}

interface WizardActions {
  setSessionId: (id: string) => void
  setStep: (step: number) => void
  setLoading: (v: boolean) => void
  setReferenceData: (data: { referenceUrl: string; referenceAnalysis: ReferenceAnalysis }) => void
  setProductData: (data: {
    productUrl: string
    logoUrl: string | null
    productScan: ProductScan
    productName: string
    whatItDoes: string
    targetAudience: string
  }) => void
  setCopyVersions: (copyVersions: CopyVersions) => void
  setConfirmedCopy: (confirmedCopy: ConfirmedCopy) => void
  setImageUrl: (url: string) => void
  resetFromStep: (step: number) => void
  hydrateFromSession: (session: SessionResponse) => void
  startNewSession: () => Promise<void>
}

const initialState: WizardState = {
  sessionId: null,
  step: 0,
  isLoading: false,
  referenceUrl: null,
  referenceAnalysis: null,
  productUrl: null,
  logoUrl: null,
  productScan: null,
  productName: null,
  whatItDoes: null,
  targetAudience: null,
  copyVersions: null,
  confirmedCopy: null,
  imageUrl: null,
}

export const useWizardStore = create<WizardState & WizardActions>((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setStep: (step) => set({ step }),
  setLoading: (v) => set({ isLoading: v }),

  setReferenceData: ({ referenceUrl, referenceAnalysis }) =>
    set({ referenceUrl, referenceAnalysis, step: 1 }),

  setProductData: ({ productUrl, logoUrl, productScan, productName, whatItDoes, targetAudience }) =>
    set({ productUrl, logoUrl, productScan, productName, whatItDoes, targetAudience, step: 2 }),

  setCopyVersions: (copyVersions) => set({ copyVersions, step: 3 }),

  setConfirmedCopy: (confirmedCopy) => set({ confirmedCopy, step: 4 }),

  setImageUrl: (url) => set({ imageUrl: url, step: 5 }),

  resetFromStep: (step) => {
    const resets: Partial<WizardState> = { step }
    if (step <= 1) {
      Object.assign(resets, {
        referenceUrl: null, referenceAnalysis: null,
        productUrl: null, logoUrl: null, productScan: null,
        productName: null, whatItDoes: null, targetAudience: null,
        copyVersions: null, confirmedCopy: null, imageUrl: null,
      })
    } else if (step <= 2) {
      Object.assign(resets, {
        productUrl: null, logoUrl: null, productScan: null,
        productName: null, whatItDoes: null, targetAudience: null,
        copyVersions: null, confirmedCopy: null, imageUrl: null,
      })
    } else if (step <= 3) {
      Object.assign(resets, { copyVersions: null, confirmedCopy: null, imageUrl: null })
    } else if (step <= 4) {
      Object.assign(resets, { confirmedCopy: null, imageUrl: null })
    }
    set(resets)
  },

  hydrateFromSession: (session) =>
    set({
      sessionId: session.id,
      step: session.step,
      referenceUrl: session.reference_url,
      referenceAnalysis: session.reference_analysis,
      productUrl: session.product_url,
      logoUrl: session.logo_url,
      productScan: session.product_scan,
      productName: session.product_name,
      whatItDoes: session.what_it_does,
      targetAudience: session.target_audience,
      copyVersions: session.copy_versions,
      confirmedCopy: session.confirmed_copy,
      imageUrl: session.image_url,
    }),

  startNewSession: async () => {
    set({ ...initialState })
    const res = await fetch('/api/sessions', { method: 'POST' })
    const { id } = (await res.json()) as { id: string }
    set({ sessionId: id })
  },
}))
```

- [ ] **Step 2: Commit**

```bash
git add store/wizard.ts
git commit -m "feat: update wizard store for new session schema"
```

---

### Task 9: API — analyze-reference

**Files:**
- Modify: `app/api/sessions/[id]/analyze-reference/route.ts`

- [ ] **Step 1: Replace the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
import { callStructured } from '@/lib/gemini'
import { ReferenceAnalysisSchema } from '@/lib/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('reference') as File | null
  if (!file) return NextResponse.json({ error: 'Missing reference image' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || 'image/jpeg'
  const base64 = bytes.toString('base64')

  const [referenceUrl, analysis] = await Promise.all([
    uploadToStorage(id, bytes, mimeType, 'reference'),
    callStructured('reference_analysis', ReferenceAnalysisSchema, [
      { inlineData: { mimeType, data: base64 } },
      { text: 'Analyze this reference ad. Return the complete structured analysis including all sceneElements.' },
    ]),
  ])

  await updateSession(id, { step: 1, reference_url: referenceUrl, reference_analysis: analysis })
  return NextResponse.json({ analysis, referenceUrl })
}
```

- [ ] **Step 2: Start dev server and test manually**

```bash
npm run dev
```

In another terminal:
```bash
curl -s -X POST http://localhost:3000/api/sessions | jq .
# Save the returned id, e.g. "abc-123"

curl -s -X POST http://localhost:3000/api/sessions/abc-123/analyze-reference \
  -F "reference=@/path/to/test-image.jpg" | jq .reference_analysis.format
```

Expected: `{ "ratio": "...", "platform": "..." }`

- [ ] **Step 3: Commit**

```bash
git add app/api/sessions/[id]/analyze-reference/route.ts
git commit -m "feat: replace analyze-reference with Gemini implementation"
```

---

### Task 10: API — analyze-product

**Files:**
- Modify: `app/api/sessions/[id]/analyze-product/route.ts`

- [ ] **Step 1: Replace the route**

This route now handles product image + optional logo + the 3 user answers in a single call.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { uploadToStorage } from '@/lib/storage'
import { callStructured } from '@/lib/gemini'
import { ProductScanSchema, ReferenceAnalysisSchema } from '@/lib/types'
import type { Part } from '@google/genai'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.reference_analysis)
    return NextResponse.json({ error: 'Complete step 1 first' }, { status: 409 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const productFile = formData.get('product') as File | null
  if (!productFile) return NextResponse.json({ error: 'Missing product image' }, { status: 400 })
  if (productFile.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'Product image too large (max 10 MB)' }, { status: 400 })

  const logoFile = formData.get('logo') as File | null

  const productName = (formData.get('productName') as string | null)?.trim()
  const whatItDoes = (formData.get('whatItDoes') as string | null)?.trim()
  const targetAudience = (formData.get('targetAudience') as string | null)?.trim()

  if (!productName || !whatItDoes || !targetAudience)
    return NextResponse.json({ error: 'Missing product answers' }, { status: 400 })

  const productBytes = Buffer.from(await productFile.arrayBuffer())
  const productMime = productFile.type || 'image/jpeg'
  const productB64 = productBytes.toString('base64')

  let logoBytes: Buffer | null = null
  let logoMime: string | null = null
  let logoB64: string | null = null
  if (logoFile && logoFile.size > 0) {
    logoBytes = Buffer.from(await logoFile.arrayBuffer())
    logoMime = logoFile.type || 'image/png'
    logoB64 = logoBytes.toString('base64')
  }

  const refAnalysis = ReferenceAnalysisSchema.parse(session.reference_analysis)

  const parts: Part[] = [
    { inlineData: { mimeType: productMime, data: productB64 } },
    ...(logoB64 && logoMime ? [{ inlineData: { mimeType: logoMime, data: logoB64 } } as Part] : []),
    {
      text: [
        `Reference ad style: ${refAnalysis.style}`,
        `Reference composition: ${refAnalysis.composition.join(', ')}`,
        `Product name: ${productName}`,
        `What it does: ${whatItDoes}`,
        `Target audience: ${targetAudience}`,
        logoB64 ? 'A brand logo is also provided.' : 'No logo provided.',
        'Analyze the product image. Return ProductScan JSON.',
      ].join('\n'),
    },
  ]

  const uploadTasks: Promise<void>[] = [
    uploadToStorage(id, productBytes, productMime, 'product').then((url) => {
      void updateSession(id, { product_url: url })
    }),
  ]
  if (logoBytes && logoMime) {
    uploadTasks.push(
      uploadToStorage(id, logoBytes, logoMime, 'logo').then((url) => {
        void updateSession(id, { logo_url: url })
      })
    )
  }

  const [productUrl, scan] = await Promise.all([
    uploadToStorage(id, productBytes, productMime, 'product'),
    callStructured('product_scan', ProductScanSchema, parts),
  ])

  const logoUrl = logoBytes && logoMime
    ? await uploadToStorage(id, logoBytes, logoMime, 'logo')
    : null

  await updateSession(id, {
    step: 2,
    product_url: productUrl,
    logo_url: logoUrl,
    product_scan: scan,
    product_name: productName,
    what_it_does: whatItDoes,
    target_audience: targetAudience,
  })

  return NextResponse.json({ scan, productUrl, logoUrl })
}
```

- [ ] **Step 2: Test manually**

```bash
curl -s -X POST http://localhost:3000/api/sessions/abc-123/analyze-product \
  -F "product=@/path/to/product.jpg" \
  -F "productName=Serum Lumina" \
  -F "whatItDoes=Reduces dark spots in 2 weeks" \
  -F "targetAudience=Women 25-40 with hyperpigmentation" | jq .scan.summaryForUser
```

Expected: Spanish summary string

- [ ] **Step 3: Commit**

```bash
git add app/api/sessions/[id]/analyze-product/route.ts
git commit -m "feat: replace analyze-product with Gemini + combined answers"
```

---

### Task 11: API — generate-copy

**Files:**
- Create: `app/api/sessions/[id]/generate-copy/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { callStructured } from '@/lib/gemini'
import { fetchAsBase64 } from '@/lib/storage'
import { CopyVersionsSchema, ReferenceAnalysisSchema, ProductScanSchema } from '@/lib/types'
import type { Part } from '@google/genai'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.step < 2)
    return NextResponse.json({ error: 'Complete steps 1–2 first' }, { status: 409 })
  if (!session.product_name || !session.what_it_does || !session.target_audience)
    return NextResponse.json({ error: 'Missing product answers' }, { status: 409 })

  let body: { comments?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const comments = typeof body.comments === 'string' ? body.comments.trim() : ''
  if (!comments) return NextResponse.json({ error: 'Missing comments' }, { status: 400 })
  if (comments.length > 8000) return NextResponse.json({ error: 'Comments too long (max 8000 chars)' }, { status: 400 })

  const refAnalysis = ReferenceAnalysisSchema.parse(session.reference_analysis)
  const productScan = ProductScanSchema.parse(session.product_scan)
  const { data: refB64, mimeType: refMime } = await fetchAsBase64(session.reference_url!)

  const parts: Part[] = [
    { inlineData: { mimeType: refMime, data: refB64 } },
    {
      text: [
        `Reference ad copy structure: ${JSON.stringify(refAnalysis.composition)}`,
        `Persuasive logic: ${refAnalysis.persuasiveLogic}`,
        `Product: ${session.product_name} — ${session.what_it_does}`,
        `Target audience: ${session.target_audience}`,
        `Product description: ${productScan.productDescription}`,
        '',
        'TikTok audience comments (raw):',
        comments,
        '',
        'Generate two copy versions as structured element arrays.',
        '',
        'VERSION A — Narrative adaptation:',
        '  Mirror every structural slot from the reference ad composition exactly.',
        '  Adapt content to the product and audience. Keep the same narrative arc.',
        '  Never invent reviews, numbers, or guarantees.',
        '',
        'VERSION B — Fill-in-the-blank audience voice:',
        '  Version B is NOT a rewrite. It is Version A with surgical word-level substitutions.',
        '  Identify the 2–5 content words naming the specific pain or symptom.',
        '  Replace ONLY those words with a phrase from the TikTok comments.',
        '  Leave everything else — sentence structure, punctuation, count — identical to Version A.',
        '',
        'RULES:',
        '  - Version B must have the EXACT SAME number of elements in the EXACT SAME order as Version A.',
        '  - Only hook/pain elements may receive substitution. All others are copied verbatim from Version A.',
        '  - Use a continuous phrase from one comment, not a collage from multiple.',
        '  - If no comment maps cleanly to a slot, copy Version A text unchanged.',
        '  - Never invent reviews, numbers, or guarantees.',
      ].join('\n'),
    },
  ]

  const copyVersions = await callStructured('copy_versions', CopyVersionsSchema, parts)
  await updateSession(id, { step: 3, tiktok_comments: comments, copy_versions: copyVersions })
  return NextResponse.json({ copyVersions })
}
```

- [ ] **Step 2: Test manually**

```bash
curl -s -X POST http://localhost:3000/api/sessions/abc-123/generate-copy \
  -H "Content-Type: application/json" \
  -d '{"comments":"tengo manchas muy feas 😭 ninguna crema me sirve"}' | jq '.copyVersions.versionA | length'
```

Expected: number >= 1

- [ ] **Step 3: Commit**

```bash
git add app/api/sessions/[id]/generate-copy/route.ts
git commit -m "feat: add generate-copy route with Gemini"
```

---

### Task 12: API — confirm-copy (simplified)

**Files:**
- Modify: `app/api/sessions/[id]/confirm-copy/route.ts`

- [ ] **Step 1: Replace the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, updateSession } from '@/lib/db'
import { CopyVersionsSchema, ConfirmedCopySchema } from '@/lib/types'

const BodySchema = z.object({ version: z.enum(['A', 'B']) })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.step < 3 || !session.copy_versions)
    return NextResponse.json({ error: 'Complete steps 1–3 first' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'version must be "A" or "B"' }, { status: 400 })

  const { version } = parsed.data
  const copyVersions = CopyVersionsSchema.parse(session.copy_versions)
  const breakdown = version === 'A' ? copyVersions.versionA : copyVersions.versionB
  const confirmedCopy = ConfirmedCopySchema.parse({ version, breakdown })

  await updateSession(id, { step: 4, confirmed_copy: confirmedCopy })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Test manually**

```bash
curl -s -X POST http://localhost:3000/api/sessions/abc-123/confirm-copy \
  -H "Content-Type: application/json" \
  -d '{"version":"B"}' | jq .
```

Expected: `{ "ok": true }`

- [ ] **Step 3: Commit**

```bash
git add app/api/sessions/[id]/confirm-copy/route.ts
git commit -m "feat: simplify confirm-copy to version A/B selection only"
```

---

### Task 13: API — generate-image (Gemini SSE)

**Files:**
- Modify: `app/api/sessions/[id]/generate-image/route.ts`

- [ ] **Step 1: Replace the route**

```typescript
import { NextRequest } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { editImage, callReasoning, STEP5_PROMPT } from '@/lib/gemini'
import { ReferenceAnalysisSchema, ProductScanSchema, ConfirmedCopySchema } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)

      try {
        const session = await getSession(id)
        if (!session || !session.reference_url || !session.product_url || !session.confirmed_copy) {
          send({ status: 'error', message: 'Session incomplete' })
          return controller.close()
        }

        const refAnalysis = ReferenceAnalysisSchema.parse(session.reference_analysis)
        const productScan = ProductScanSchema.parse(session.product_scan)
        const confirmedCopy = ConfirmedCopySchema.parse(session.confirmed_copy)
        const hasLogo = !!session.logo_url

        // Step 1: build prompt
        send({ status: 'building_prompt' })
        const contextForReasoning = [
          `=== REFERENCE ANALYSIS ===`,
          `Physical position: ${refAnalysis.physicalPosition}`,
          `Layout: ${refAnalysis.layoutDescription}`,
          `Style: ${refAnalysis.style}`,
          `Scene elements:`,
          `  People: ${JSON.stringify(refAnalysis.sceneElements.people)}`,
          `  Props: ${JSON.stringify(refAnalysis.sceneElements.props)}`,
          `  Brand elements: ${JSON.stringify(refAnalysis.sceneElements.brandElements)}`,
          `  Setting: ${refAnalysis.sceneElements.setting}`,
          ``,
          `=== PRODUCT INFO ===`,
          `Product name: ${session.product_name}`,
          `What it does: ${session.what_it_does}`,
          `Target audience: ${session.target_audience}`,
          `Product description: ${productScan.productDescription}`,
          `Branding: ${productScan.brandingDescription ?? 'not provided'}`,
          `Logo provided: ${hasLogo ? 'YES — Image 3 is the brand logo' : 'NO'}`,
          ``,
          `=== APPROVED COPY ===`,
          `Version ${confirmedCopy.version}:`,
          ...confirmedCopy.breakdown.map((e) => `  ${e.element}: "${e.text}"`),
        ].join('\n')

        const editInstruction = await callReasoning(STEP5_PROMPT, contextForReasoning)

        // Step 2: load images
        send({ status: 'loading_images' })
        const [ref, product, logo] = await Promise.all([
          fetchAsBase64(session.reference_url),
          fetchAsBase64(session.product_url),
          session.logo_url ? fetchAsBase64(session.logo_url) : Promise.resolve(null),
        ])

        // Step 3: generate
        send({ status: 'generating' })
        const b64 = await editImage(
          ref.data, ref.mimeType,
          product.data, product.mimeType,
          logo?.data ?? null, logo?.mimeType ?? null,
          editInstruction
        )

        if (!b64) {
          send({ status: 'error', message: 'Image generation returned empty result' })
          return controller.close()
        }

        // Step 4: upload
        send({ status: 'uploading' })
        const imageBuffer = Buffer.from(b64, 'base64')
        const imageUrl = await uploadToStorage(id, imageBuffer, 'image/png', 'result')

        await updateSession(id, { step: 5, edit_instruction: editInstruction, image_url: imageUrl })

        send({ status: 'done', imageUrl })
      } catch (err) {
        send({ status: 'error', message: String(err), retryable: true })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/sessions/[id]/generate-image/route.ts
git commit -m "feat: replace generate-image with Gemini SSE implementation"
```

---

### Task 14: API — refine-image

**Files:**
- Create: `app/api/sessions/[id]/refine-image/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, updateSession } from '@/lib/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { refineImage } from '@/lib/gemini'

const BodySchema = z.object({ feedback: z.string().min(1).max(1000) })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.image_url || !session.reference_url || !session.product_url)
    return NextResponse.json({ error: 'No image to refine yet' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'feedback required (max 1000 chars)' }, { status: 400 })

  const [ref, product, logo, result] = await Promise.all([
    fetchAsBase64(session.reference_url),
    fetchAsBase64(session.product_url),
    session.logo_url ? fetchAsBase64(session.logo_url) : Promise.resolve(null),
    fetchAsBase64(session.image_url),
  ])

  const b64 = await refineImage(
    ref.data, ref.mimeType,
    product.data, product.mimeType,
    logo?.data ?? null, logo?.mimeType ?? null,
    result.data, result.mimeType,
    parsed.data.feedback
  )

  if (!b64) return NextResponse.json({ error: 'Refinement returned empty result' }, { status: 422 })

  const imageBuffer = Buffer.from(b64, 'base64')
  const imageUrl = await uploadToStorage(id, imageBuffer, 'image/png', `result-${Date.now()}`)
  await updateSession(id, { image_url: imageUrl })
  return NextResponse.json({ imageUrl })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/sessions/[id]/refine-image/route.ts
git commit -m "feat: add refine-image route"
```

---

### Task 15: UI — AccordionSection component

**Files:**
- Create: `components/tools/generador-anuncios/AccordionSection.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

type SectionStatus = 'locked' | 'active' | 'completed'

interface AccordionSectionProps {
  index: number
  title: string
  status: SectionStatus
  summary?: string
  children: React.ReactNode
  onReopen?: () => void
}

const statusStyles: Record<SectionStatus, {
  border: string
  headerBg: string
  opacity: string
  iconBg: string
  iconBorder: string
  iconColor: string
}> = {
  locked: {
    border: 'border border-dashed border-white/[0.08]',
    headerBg: '',
    opacity: 'opacity-45',
    iconBg: 'bg-white/[0.04]',
    iconBorder: 'border-white/[0.1]',
    iconColor: 'text-[#475569]',
  },
  active: {
    border: 'border border-[rgba(245,158,11,0.4)] shadow-[0_0_0_1px_rgba(245,158,11,0.08)]',
    headerBg: 'bg-[rgba(245,158,11,0.06)]',
    opacity: '',
    iconBg: 'bg-[rgba(245,158,11,0.15)]',
    iconBorder: 'border-[rgba(245,158,11,0.4)]',
    iconColor: 'text-[#f59e0b]',
  },
  completed: {
    border: 'border border-[rgba(34,197,94,0.25)]',
    headerBg: 'bg-[rgba(34,197,94,0.04)]',
    opacity: '',
    iconBg: 'bg-[rgba(34,197,94,0.15)]',
    iconBorder: 'border-[rgba(34,197,94,0.35)]',
    iconColor: 'text-[#22c55e]',
  },
}

export default function AccordionSection({
  index,
  title,
  status,
  summary,
  children,
  onReopen,
}: AccordionSectionProps) {
  const s = statusStyles[status]
  const isOpen = status === 'active'
  const canReopen = status === 'completed' && !!onReopen

  return (
    <div className={`rounded-2xl overflow-hidden transition-all duration-300 ${s.border} ${s.opacity}`}>
      {/* Header */}
      <div
        className={`px-4 py-3 flex items-center gap-3 ${s.headerBg} ${isOpen ? 'border-b border-white/[0.06]' : ''} ${canReopen ? 'cursor-pointer' : ''}`}
        onClick={canReopen ? onReopen : undefined}
      >
        <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 border ${s.iconBg} ${s.iconBorder}`}>
          {status === 'completed' ? (
            <span className={`text-[11px] font-bold ${s.iconColor}`}>✓</span>
          ) : status === 'locked' ? (
            <span className="text-[11px]">🔒</span>
          ) : (
            <span className={`text-[11px] font-bold ${s.iconColor}`}>{index}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-bold ${status === 'locked' ? 'text-[#475569]' : 'text-[#f1f5f9]'}`}>
            {title}
          </p>
          {status === 'completed' && summary && (
            <p className="text-[11px] text-[#94a3b8] mt-0.5 truncate">{summary}</p>
          )}
        </div>
        {canReopen && (
          <span className="text-[10px] text-[#475569] shrink-0">▼ editar</span>
        )}
      </div>

      {/* Body */}
      {isOpen && (
        <div className="bg-[#0d0d18] px-4 pb-5 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/tools/generador-anuncios/AccordionSection.tsx
git commit -m "feat: add AccordionSection reusable component"
```

---

### Task 16: UI — Section1Reference + Section2Product

**Files:**
- Create: `components/tools/generador-anuncios/sections/Section1Reference.tsx`
- Create: `components/tools/generador-anuncios/sections/Section2Product.tsx`

- [ ] **Step 1: Create `Section1Reference.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import type { ReferenceAnalysis } from '@/lib/types'

const btnPrimary = 'h-11 w-full rounded-xl text-white text-[13px] font-bold bg-brand-gradient hover:opacity-90 disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export default function Section1Reference() {
  const { sessionId, setReferenceData, setLoading, isLoading } = useWizardStore()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleFile(f: File) {
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setError(null)
  }

  async function handleSubmit() {
    if (!sessionId || !file || isLoading) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('reference', file)
      const res = await fetch(`/api/sessions/${sessionId}/analyze-reference`, { method: 'POST', body: form })
      const data = await res.json() as { analysis?: ReferenceAnalysis; referenceUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al analizar la imagen')
      setReferenceData({ referenceUrl: data.referenceUrl!, referenceAnalysis: data.analysis! })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#94a3b8] leading-relaxed">
        Sube el anuncio que quieres replicar. Analizaré su formato, composición, estilo y lógica persuasiva.
      </p>
      <FileUpload label="Seleccionar imagen de referencia" onFile={handleFile} preview={preview} />
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">
          {error}
        </div>
      )}
      <button onClick={handleSubmit} disabled={!file || isLoading} className={btnPrimary}>
        {isLoading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analizando...</>
        ) : 'Analizar referencia →'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `Section2Product.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import type { ProductScan } from '@/lib/types'

const btnPrimary = 'h-11 w-full rounded-xl text-white text-[13px] font-bold bg-brand-gradient hover:opacity-90 disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'
const inputClass = 'w-full h-10 rounded-xl border border-white/[0.08] bg-[#080810] px-3 text-[13px] text-[#f1f5f9] placeholder:text-[#475569] focus:outline-none focus:border-[rgba(245,158,11,0.5)] transition-colors'

export default function Section2Product() {
  const { sessionId, setProductData, setLoading, isLoading } = useWizardStore()
  const [productFile, setProductFile] = useState<File | null>(null)
  const [productPreview, setProductPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [answers, setAnswers] = useState({ productName: '', whatItDoes: '', targetAudience: '' })
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !!productFile && !!answers.productName && !!answers.whatItDoes && !!answers.targetAudience

  async function handleSubmit() {
    if (!sessionId || !canSubmit || isLoading) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('product', productFile!)
      if (logoFile) form.append('logo', logoFile)
      form.append('productName', answers.productName)
      form.append('whatItDoes', answers.whatItDoes)
      form.append('targetAudience', answers.targetAudience)

      const res = await fetch(`/api/sessions/${sessionId}/analyze-product`, { method: 'POST', body: form })
      const data = await res.json() as { scan?: ProductScan; productUrl?: string; logoUrl?: string | null; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al analizar el producto')
      setProductData({
        productUrl: data.productUrl!,
        logoUrl: data.logoUrl ?? null,
        productScan: data.scan!,
        productName: answers.productName,
        whatItDoes: answers.whatItDoes,
        targetAudience: answers.targetAudience,
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#475569] mb-2">Imagen del producto *</p>
        <FileUpload label="Subir producto" onFile={(f) => { setProductFile(f); setProductPreview(URL.createObjectURL(f)) }} preview={productPreview} />
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#475569] mb-2">Logo (opcional)</p>
        <FileUpload label="Subir logo" onFile={(f) => { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) }} preview={logoPreview} />
      </div>
      <div className="flex flex-col gap-3 pt-1">
        <p className="text-[12px] text-[#94a3b8]">Tres preguntas rápidas:</p>
        {[
          { key: 'productName', placeholder: '¿Cómo se llama tu producto?' },
          { key: 'whatItDoes', placeholder: '¿Qué hace? (una frase corta)' },
          { key: 'targetAudience', placeholder: '¿Para quién es?' },
        ].map(({ key, placeholder }, i) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white/[0.05] text-[#475569] text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <input
              type="text"
              placeholder={placeholder}
              value={answers[key as keyof typeof answers]}
              onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
              className={inputClass}
            />
          </div>
        ))}
      </div>
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}
      <button onClick={handleSubmit} disabled={!canSubmit || isLoading} className={btnPrimary}>
        {isLoading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analizando producto...</>
        ) : 'Continuar →'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/tools/generador-anuncios/sections/Section1Reference.tsx components/tools/generador-anuncios/sections/Section2Product.tsx
git commit -m "feat: add Section1Reference and Section2Product UI components"
```

---

### Task 17: UI — Section3Comments + Section4Copy

**Files:**
- Create: `components/tools/generador-anuncios/sections/Section3Comments.tsx`
- Create: `components/tools/generador-anuncios/sections/Section4Copy.tsx`

- [ ] **Step 1: Create `Section3Comments.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import type { CopyVersions } from '@/lib/types'

const TIKTOK_SCRIPT = `Busca en TikTok videos sobre el problema que resuelve tu producto.
Abre 2–3 videos con muchos comentarios.
Copia y pega aquí los comentarios tal como están — con errores, emojis y todo.

Eso es lo que voy a usar para escribir el texto de tu anuncio con las palabras exactas de tu audiencia. Entre más reales, mejor.`

const btnPrimary = 'h-11 w-full rounded-xl text-white text-[13px] font-bold bg-brand-gradient hover:opacity-90 disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export default function Section3Comments() {
  const { sessionId, setCopyVersions, setLoading, isLoading } = useWizardStore()
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!sessionId || !comments.trim() || isLoading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/generate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments }),
      })
      const data = await res.json() as { copyVersions?: CopyVersions; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al generar el copy')
      setCopyVersions(data.copyVersions!)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/[0.08] bg-[#080810] px-4 py-4">
        <pre className="text-[12px] text-[#94a3b8] whitespace-pre-wrap font-sans leading-relaxed">{TIKTOK_SCRIPT}</pre>
      </div>
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        rows={7}
        placeholder="Pega aquí los comentarios..."
        className="rounded-xl border border-white/[0.08] bg-[#080810] px-4 py-3 text-[13px] text-[#f1f5f9] placeholder:text-[#475569] resize-none focus:outline-none focus:border-[rgba(245,158,11,0.5)] transition-colors"
      />
      {isLoading && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[11px] text-[#94a3b8]">
            <span>Generando copy A/B...</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-brand-gradient animate-pulse" />
          </div>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}
      <button onClick={handleSubmit} disabled={!comments.trim() || isLoading} className={btnPrimary}>
        {isLoading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generando versiones...</>
        ) : 'Generar copy del anuncio →'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `Section4Copy.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import type { CopyElement } from '@/lib/types'

const btnPrimary = 'h-11 w-full rounded-xl text-white text-[13px] font-bold bg-brand-gradient hover:opacity-90 disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

function CopyCard({
  version,
  label,
  recommended,
  elements,
  selected,
  onPick,
}: {
  version: 'A' | 'B'
  label: string
  recommended?: boolean
  elements: CopyElement[]
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full text-left rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        border: selected ? '2px solid rgba(245,158,11,0.6)' : '1px solid rgba(255,255,255,0.08)',
        background: selected ? 'rgba(245,158,11,0.04)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#475569]">{label}</span>
        {recommended && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[rgba(245,158,11,0.1)] text-[#f59e0b] border border-[rgba(245,158,11,0.2)]">
            ★ Recomendada
          </span>
        )}
        {selected && <span className="ml-auto text-[#f59e0b] text-[11px]">✓</span>}
      </div>
      <div className="px-4 divide-y divide-white/[0.04]">
        {elements.map((el) => (
          <div key={el.element} className="py-2.5 flex gap-3 items-start">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[#475569] w-16 mt-0.5">{el.element}</span>
            <span className="text-[12px] text-[#f1f5f9] leading-relaxed">&ldquo;{el.text}&rdquo;</span>
          </div>
        ))}
      </div>
    </button>
  )
}

export default function Section4Copy() {
  const { sessionId, copyVersions, setConfirmedCopy, setLoading, isLoading } = useWizardStore()
  const [selected, setSelected] = useState<'A' | 'B' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!copyVersions) return null

  async function handleConfirm() {
    if (!sessionId || !selected || isLoading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/confirm-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: selected }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al confirmar')
      const breakdown = selected === 'A' ? copyVersions!.versionA : copyVersions!.versionB
      setConfirmedCopy({ version: selected, breakdown })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#94a3b8]">
        Versión B usa las palabras exactas de tu audiencia. Ambas mantienen la estructura del anuncio original.
      </p>
      <CopyCard version="A" label="Versión A" elements={copyVersions.versionA} selected={selected === 'A'} onPick={() => setSelected('A')} />
      <CopyCard version="B" label="Versión B" recommended elements={copyVersions.versionB} selected={selected === 'B'} onPick={() => setSelected('B')} />
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}
      <button onClick={handleConfirm} disabled={!selected || isLoading} className={btnPrimary}>
        {isLoading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Confirmando...</>
        ) : `Confirmar Versión ${selected ?? '...'} →`}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/tools/generador-anuncios/sections/Section3Comments.tsx components/tools/generador-anuncios/sections/Section4Copy.tsx
git commit -m "feat: add Section3Comments and Section4Copy UI components"
```

---

### Task 18: UI — Section5Generate

**Files:**
- Create: `components/tools/generador-anuncios/sections/Section5Generate.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState, useRef } from 'react'
import { useWizardStore } from '@/store/wizard'
import { SSEStatus } from '@/components/tools/ui/SSEStatus'

const STATUS_LABELS: Record<string, { text: string; pct: number }> = {
  building_prompt: { text: 'Preparando instrucciones...', pct: 15 },
  loading_images:  { text: 'Cargando imágenes...', pct: 30 },
  generating:      { text: 'Generando el anuncio con IA...', pct: 60 },
  uploading:       { text: 'Guardando imagen final...', pct: 90 },
  done:            { text: '¡Listo!', pct: 100 },
}

const STAGES = ['building_prompt', 'loading_images', 'generating', 'uploading', 'done']

const btnPrimary = 'rounded-xl text-white text-[13px] font-bold bg-brand-gradient hover:opacity-90 disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export default function Section5Generate() {
  const { sessionId, imageUrl, setImageUrl, startNewSession } = useWizardStore()
  const [status, setStatus] = useState<string>('building_prompt')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [refining, setRefining] = useState(false)
  const sseKey = useRef(0)

  function handleEvent(event: { status: string; imageUrl?: string; message?: string }) {
    const info = STATUS_LABELS[event.status]
    if (info) setProgress(info.pct)
    setStatus(event.status)
    if (event.status === 'done' && event.imageUrl) setImageUrl(event.imageUrl)
    if (event.status === 'error') setError(event.message ?? 'Error al generar')
  }

  async function handleDownload() {
    if (!imageUrl) return
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `anuncio-${Date.now()}.png`; a.click()
      URL.revokeObjectURL(url)
    } catch { window.open(imageUrl, '_blank') }
  }

  async function handleRefine() {
    if (!sessionId || !feedback.trim() || refining) return
    setRefining(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/refine-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedback.trim() }),
      })
      const data = await res.json() as { imageUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al aplicar cambios')
      setImageUrl(data.imageUrl!)
      setFeedback('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRefining(false)
    }
  }

  if (!sessionId) return null

  const isGenerating = !imageUrl && !error

  return (
    <div className="flex flex-col gap-4">
      {isGenerating && (
        <>
          <SSEStatus
            key={sseKey.current}
            url={`/api/sessions/${sessionId}/generate-image`}
            onEvent={handleEvent}
          />
          <p className="text-[13px] text-[#94a3b8]">Esto puede tomar entre 15 y 40 segundos.</p>

          {/* Progress bar with stage indicators */}
          <div>
            <div className="flex justify-between text-[11px] text-[#94a3b8] mb-1.5">
              <span>{STATUS_LABELS[status]?.text ?? status}</span>
              <span className="text-[#f59e0b] font-bold">{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#f59e0b 0%,#ef4444 100%)' }}
              />
            </div>
            <div className="flex gap-1">
              {STAGES.map((s) => {
                const idx = STAGES.indexOf(s)
                const currentIdx = STAGES.indexOf(status)
                return (
                  <div
                    key={s}
                    className="flex-1 h-[2px] rounded-full transition-colors duration-500"
                    style={{
                      background:
                        idx < currentIdx ? '#22c55e' :
                        idx === currentIdx ? 'linear-gradient(90deg,#f59e0b,#ef4444)' :
                        'rgba(255,255,255,0.08)',
                    }}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-[9px] text-[#475569] mt-1">
              <span>prompt</span><span>imágenes</span><span>generando</span><span>guardando</span><span>listo</span>
            </div>
          </div>

          {/* Skeleton */}
          <div className="aspect-[9/16] max-h-[300px] rounded-2xl bg-[#131320] animate-pulse border border-white/[0.06] flex items-center justify-center">
            <span className="text-[#475569] text-[12px]">generando...</span>
          </div>
        </>
      )}

      {error && !imageUrl && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
          <button
            onClick={() => { setError(null); setProgress(0); setStatus('building_prompt'); sseKey.current += 1 }}
            className={btnPrimary + ' h-11 w-full'}
          >
            Reintentar
          </button>
        </div>
      )}

      {imageUrl && (
        <div className="flex flex-col gap-4">
          <img src={imageUrl} alt="Anuncio generado" className="w-full rounded-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,.6)]" />
          <div className="flex gap-3">
            <button onClick={handleDownload} className={btnPrimary + ' flex-1 h-11'}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Descargar
            </button>
            <button onClick={startNewSession} className="h-11 px-4 rounded-xl border border-white/[0.14] text-[#f1f5f9] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent">
              Nuevo anuncio
            </button>
          </div>
          <div className="border-t border-white/[0.06] pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#475569] mb-2">¿Quieres ajustar algo?</p>
            {error && <div className="mb-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">{error}</div>}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ej: fondo más oscuro, CTA más grande..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !refining && handleRefine()}
                className="flex-1 h-10 rounded-xl border border-white/[0.08] bg-[#080810] px-3 text-[13px] text-[#f1f5f9] placeholder:text-[#475569] focus:outline-none focus:border-[rgba(245,158,11,0.5)] transition-colors"
              />
              <button
                onClick={handleRefine}
                disabled={!feedback.trim() || refining}
                className={btnPrimary + ' h-10 px-4 shrink-0'}
              >
                {refining ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/tools/generador-anuncios/sections/Section5Generate.tsx
git commit -m "feat: add Section5Generate with SSE progress and refine"
```

---

### Task 19: UI — AdWizard + page.tsx

**Files:**
- Create: `components/tools/generador-anuncios/AdWizard.tsx`
- Modify: `app/tools/generador-anuncios/page.tsx`

- [ ] **Step 1: Create `AdWizard.tsx`**

```typescript
'use client'

import { useEffect } from 'react'
import { useWizardStore } from '@/store/wizard'
import AccordionSection from './AccordionSection'
import Section1Reference from './sections/Section1Reference'
import Section2Product from './sections/Section2Product'
import Section3Comments from './sections/Section3Comments'
import Section4Copy from './sections/Section4Copy'
import Section5Generate from './sections/Section5Generate'

function getStatus(sectionStep: number, currentStep: number): 'locked' | 'active' | 'completed' {
  if (currentStep >= sectionStep + 1) return 'completed'
  if (currentStep === sectionStep) return 'active'
  return 'locked'
}

export default function AdWizard() {
  const { step, startNewSession, referenceAnalysis, productName, targetAudience, confirmedCopy, resetFromStep } = useWizardStore()

  useEffect(() => { startNewSession() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const progressPct = Math.round((step / 5) * 100)

  return (
    <div className="flex flex-col min-h-screen bg-[#080810]">
      {/* Progress bar */}
      <div className="h-[2px] bg-white/[0.06]">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,#f59e0b,#ef4444)' }}
        />
      </div>

      <div className="flex-1 max-w-xl mx-auto w-full px-4 py-8 flex flex-col gap-3">
        {/* Section 1 */}
        <AccordionSection
          index={1}
          title="Anuncio de referencia"
          status={getStatus(0, step)}
          summary={referenceAnalysis ? `${referenceAnalysis.format.ratio} · ${referenceAnalysis.format.platform} · ${referenceAnalysis.style}` : undefined}
          onReopen={() => resetFromStep(0)}
        >
          <Section1Reference />
        </AccordionSection>

        {/* Section 2 */}
        <AccordionSection
          index={2}
          title="Producto + información"
          status={getStatus(1, step)}
          summary={productName && targetAudience ? `${productName} · ${targetAudience}` : undefined}
          onReopen={() => resetFromStep(1)}
        >
          <Section2Product />
        </AccordionSection>

        {/* Section 3 */}
        <AccordionSection
          index={3}
          title="Comentarios de TikTok"
          status={getStatus(2, step)}
          summary={step >= 3 ? 'Copy A/B generado' : undefined}
          onReopen={() => resetFromStep(2)}
        >
          <Section3Comments />
        </AccordionSection>

        {/* Section 4 */}
        <AccordionSection
          index={4}
          title="Elegir versión de copy"
          status={getStatus(3, step)}
          summary={confirmedCopy ? `Versión ${confirmedCopy.version} confirmada` : undefined}
          onReopen={() => resetFromStep(3)}
        >
          <Section4Copy />
        </AccordionSection>

        {/* Section 5 */}
        <AccordionSection
          index={5}
          title={step >= 5 ? '¡Anuncio listo!' : 'Generar anuncio'}
          status={getStatus(4, step)}
        >
          <Section5Generate />
        </AccordionSection>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace `app/tools/generador-anuncios/page.tsx`**

```typescript
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import AdWizard from "@/components/tools/generador-anuncios/AdWizard";

export default function GeneradorAnuncios() {
  return (
    <div className="min-h-screen flex flex-col bg-[#080810]">
      {/* Breadcrumb */}
      <div className="px-8 py-3.5 border-b border-white/[0.08] flex items-center gap-2 text-[13px]">
        <Link href="/" className="text-[#475569] hover:text-[#94a3b8] transition-colors no-underline">
          Herramientas
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-[#475569]" />
        <span className="text-[#f1f5f9] font-semibold">Generador de Anuncios</span>
      </div>
      <AdWizard />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/tools/generador-anuncios/AdWizard.tsx app/tools/generador-anuncios/page.tsx
git commit -m "feat: add AdWizard accordion container and wire into page"
```

---

### Task 20: Run all tests

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass (smoke + gemini + storage + db)

- [ ] **Step 2: Start dev server and verify the page loads**

```bash
npm run dev
```

Open `http://localhost:3000/tools/generador-anuncios`. Verify:
- Breadcrumb shows correctly
- Thin progress bar visible at top
- Section 1 "Anuncio de referencia" is active (amber border)
- Sections 2–5 are locked (dashed border, faded)
- No console errors

---

### Task 21: Cleanup — delete old files

- [ ] **Step 1: Delete old step components**

```bash
git rm components/tools/generador-imagenes/Step1Reference.tsx
git rm components/tools/generador-imagenes/Step2Product.tsx
git rm components/tools/generador-imagenes/Step3TikTok.tsx
git rm components/tools/generador-imagenes/Step4Copy.tsx
git rm components/tools/generador-imagenes/Step5Result.tsx
```

- [ ] **Step 2: Delete old lib files**

```bash
git rm lib/openai.ts
git rm lib/golden-rules.ts
git rm lib/prompts/analyze-reference.ts
git rm lib/prompts/analyze-product.ts
git rm lib/prompts/generate-copy.ts
git rm lib/prompts/master-prompt.ts
```

- [ ] **Step 3: Delete old API route**

```bash
git rm app/api/sessions/[id]/answers/route.ts
```

- [ ] **Step 4: Check if `@vercel/blob` and `openai` are used anywhere else**

```bash
grep -r "vercel/blob\|from 'openai'" app/ components/ lib/ store/ --include="*.ts" --include="*.tsx"
```

If no matches: remove from `package.json` dependencies and run `npm install`.

- [ ] **Step 5: Check if `StepIndicator` is used elsewhere**

```bash
grep -r "StepIndicator" app/ components/ --include="*.tsx"
```

If no matches other than the old generador-imagenes components:
```bash
git rm components/tools/StepIndicator.tsx
```

- [ ] **Step 6: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove old OpenAI-based wizard components and routes"
```

---

### Task 22: Integration test — full flow

- [ ] **Step 1: Open the tool at `http://localhost:3000/tools/generador-anuncios`**

- [ ] **Step 2: Test Section 1 — reference upload**
  1. Upload a real JPG ad image
  2. Click "Analizar referencia →"
  3. Spinner appears in section header
  4. After ~5 sec: Section 1 collapses showing `ratio · platform · style` summary
  5. Section 2 expands with amber border
  6. Progress bar advances to ~20%

- [ ] **Step 3: Test Section 2 — product**
  1. Upload product image
  2. Fill in the 3 fields
  3. Click "Continuar →"
  4. After ~5 sec: Section 2 collapses with `productName · audience` summary
  5. Section 3 expands

- [ ] **Step 4: Test Section 3 — TikTok comments**
  1. Paste sample comments
  2. Click "Generar copy →"
  3. Loading bar shows in section body
  4. After ~10 sec: Section 3 collapses with "Copy A/B generado"
  5. Section 4 expands showing Version A and B cards

- [ ] **Step 5: Test Section 4 — copy selection**
  1. Click Versión B card (it highlights with amber border)
  2. Click "Confirmar Versión B →"
  3. Section 4 collapses with "Versión B confirmada"
  4. Section 5 expands and starts generating automatically (SSE fires)

- [ ] **Step 6: Test Section 5 — generation**
  1. Progress bar shows: prompt (15%) → imágenes (30%) → generando (60%) → guardando (90%) → listo (100%)
  2. Stage indicator below bar shows correct active stage
  3. After ~20–40 sec: image appears
  4. "Descargar" button downloads the image
  5. Type feedback → "Aplicar" → spinner → new image replaces old one

- [ ] **Step 7: Test re-editing a section**
  1. Click a completed section header (e.g. Section 2)
  2. Verify it re-expands and sections 3–5 reset to locked state
  3. Re-submit and verify flow resumes from that section

- [ ] **Step 8: Commit if any fixes were needed during integration**

```bash
git add -A
git commit -m "fix: integration test fixes"
```
