# Generador de Anuncios — All-in-One Page (Rediseño)

**Fecha:** 2026-05-25  
**Estado:** Aprobado  
**Fuente de referencia:** `../sistema1_app_4.0`

---

## Resumen

Reemplazar el wizard por pasos del Generador de Anuncios con una página all-in-one de acordeón. Las cinco secciones viven en la misma URL; cada una se colapsa con un resumen al completarse y desbloquea la siguiente. La generación de IA migra de OpenAI a Google Gemini. El almacenamiento de imágenes pasa de Vercel Blob a Supabase Storage. La fase de edición de copy se elimina (flujo simplificado A/B).

---

## Qué cambia, qué se mantiene

### Se mantiene
- Supabase (base de datos de sesiones)
- Supabase Storage (almacenamiento de imágenes — reemplaza Vercel Blob)
- Next.js 16 + estructura del hub (`app/tools/generador-anuncios/`)
- Design system OLED dark + tokens de marca (amber/red gradient)
- Endpoints base: `POST /api/sessions`, `GET /api/sessions/[id]`
- SSE streaming para la generación de imagen (UX de progreso)
- Zustand store para estado del wizard

### Se reemplaza / elimina
- OpenAI GPT-4o → **Gemini 2.5 Flash** (análisis y copy)
- GPT-image-2 → **Gemini imagen** (`gemini-3.1-flash-image-preview`)
- Vercel Blob → **Supabase Storage** (bucket: `ad-uploads`)
- Wizard por pasos con `StepIndicator` → **Acordeón all-in-one**
- Tipos complejos del hub (CreativeIntent, CompatibilityAudit, golden-rules) → **schema simplificado de sistema1**
- Fase de edición de copy (choose → edit → confirm) → **solo choose → confirm**
- `@vercel/blob` dependency (eliminada del proyecto si no la usa otro tool)

---

## Schema de sesión (Supabase)

Nueva tabla `sessions` con schema simplificado:

```sql
CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  step                INTEGER NOT NULL DEFAULT 0,

  -- Step 1: Referencia
  reference_url       TEXT,
  reference_analysis  JSONB,

  -- Step 2: Producto + preguntas
  product_url         TEXT,
  logo_url            TEXT,
  product_scan        JSONB,
  product_name        TEXT,
  what_it_does        TEXT,
  target_audience     TEXT,

  -- Step 3: Copy
  tiktok_comments     TEXT,
  copy_versions       JSONB,

  -- Step 4: Confirmación
  confirmed_copy      JSONB,

  -- Step 5: Resultado
  edit_instruction    TEXT,
  image_url           TEXT
);
```

**Tipos TypeScript** (en `lib/types.ts` — se reemplaza el archivo):

```typescript
// ReferenceAnalysis — fiel al schema de sistema1
interface ReferenceAnalysis {
  format: { ratio: string; platform: string }
  style: string
  composition: string[]
  replacements: string[]
  physicalPosition: string
  colorimetry: string
  typography: string
  persuasiveLogic: string
  layoutDescription: string
  sceneElements: {
    people: string[]
    props: string[]
    brandElements: string[]
    setting: string
  }
  summaryForUser: string
}

// ProductScan
interface ProductScan {
  productDescription: string
  brandingDescription: string | null
  styleCompatibilityNote: string | null
  summaryForUser: string
}

// CopyVersions
interface CopyVersions {
  versionA: CopyElement[]
  versionB: CopyElement[]
}
interface CopyElement { element: string; text: string }

// ConfirmedCopy
interface ConfirmedCopy {
  version: 'A' | 'B'
  breakdown: CopyElement[]
}

// Session (API response shape)
interface SessionResponse {
  id: string
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
  image_url: string | null
}
```

---

## Capas de implementación

### 1. `lib/gemini.ts` (nuevo)
Cliente Gemini con dos funciones principales:
- `callStructured<T>(schemaName, schema, parts)` → JSON estructurado vía `gemini-2.5-flash` con `responseMimeType: 'application/json'`
- `callReasoning(systemPrompt, userMessage)` → texto libre
- `STEP5_PROMPT` → prompt para construir la instrucción de edición de imagen

### 2. `lib/storage.ts` (nuevo)
Helper para Supabase Storage:
- `uploadToStorage(sessionId, file, name)` → sube archivo, retorna URL pública
- `fetchAsBase64(url)` → descarga desde Supabase Storage, retorna `{ data: string, mimeType: string }` para pasar a Gemini como `inlineData`

### 3. `lib/db.ts` (actualizar)
Adaptar `getSession` y `updateSession` para el nuevo schema. `SessionResponse` serializa JSONB directamente (no JSON strings como sistema1 SQLite).

### 4. `lib/types.ts` (reemplazar)
Usar los tipos simplificados documentados arriba.

### 5. `store/wizard.ts` (actualizar)
Campos del store ajustados al nuevo schema: `referenceAnalysis`, `productScan`, `copyVersions`, `confirmedCopy`, `imageUrl`, `step` (0–5).

---

## Rutas API

| Ruta | Cambio | Responsabilidad |
|------|--------|----------------|
| `POST /api/sessions` | Mantiene | Crea sesión, retorna `{id}` |
| `GET /api/sessions/[id]` | Mantiene | Lee sesión completa |
| `POST /api/sessions/[id]/analyze-reference` | Reemplaza | Upload → Supabase Storage → Gemini 2.5 Flash → `ReferenceAnalysis` → step=1 |
| `POST /api/sessions/[id]/analyze-product` | Reemplaza | Upload product + logo + answers → Supabase Storage → Gemini scan → `ProductScan` → step=2 |
| `POST /api/sessions/[id]/generate-copy` | Nuevo | TikTok comments → Gemini → `CopyVersions` {A,B} → step=3 |
| `POST /api/sessions/[id]/confirm-copy` | Simplifica | Body `{version:'A'\|'B'}` → guarda `confirmed_copy` → step=4 |
| `POST /api/sessions/[id]/generate-image` | Reemplaza | SSE stream: fetch images → base64 → Gemini editImage → Supabase Storage → step=5 |
| `POST /api/sessions/[id]/refine-image` | Nuevo | Body `{feedback}` → Gemini refineImage con resultado actual → nuevo `image_url` |

**Imagen → Gemini:** Las imágenes se almacenan en Supabase Storage. Cuando Gemini las necesita: `fetch(url)` → `arrayBuffer()` → `Buffer.toString('base64')` → Part `inlineData`.

---

## UI: Acordeón all-in-one

**Archivo:** `app/tools/generador-anuncios/page.tsx` (reemplazar)  
**Componente nuevo:** `components/tools/generador-anuncios/AdWizard.tsx`

### Comportamiento del acordeón

Cada sección tiene tres estados visuales:

| Estado | Borde | Fondo header | Ícono | Cuerpo |
|--------|-------|--------------|-------|--------|
| **Bloqueada** | `dashed white/8`, opacity 45–15% | — | 🔒 | Oculto |
| **Activa** | `solid amber/40` + glow | `amber/6` | número en amber | Expandido |
| **Completada** | `solid green/25` | `green/4` | ✓ verde | Colapsado + resumen |

Las secciones completadas pueden expandirse al hacer clic para re-hacerlas. Si el usuario re-envía una sección, todas las secciones posteriores se resetean (vuelven a estado bloqueado) y el `step` de la sesión retrocede al número correspondiente. Esto es necesario porque cada sección depende de los datos de las anteriores.

### Barra de progreso global
- Línea fina de 2px en la parte superior de la página (debajo del breadcrumb)
- Avanza de 0% a 100% según el `step` actual: step 0 → 0%, step 1 → 20%, …, step 5 → 100%
- Color: `linear-gradient(90deg, #f59e0b, #ef4444)`

### Las 5 secciones

#### Sección 1 — Referencia
- **Activa:** FileUpload + botón "Analizar referencia". Spinner en header durante la llamada API.
- **Completada (colapsada):** resumen `{ratio} · {platform} · {style}`

#### Sección 2 — Producto + información
- **Activa:** FileUpload producto (requerido) + FileUpload logo (opcional) + 3 inputs (`productName`, `whatItDoes`, `targetAudience`) + botón "Analizar producto". Spinner durante llamada.
- **Completada:** resumen `{productName} · {targetAudience}`

#### Sección 3 — Comentarios TikTok
- **Activa:** Script TikTok (texto fijo, como en sistema1) + textarea + botón "Generar copy". Loading bar + texto de estado mientras genera.
- **Completada:** resumen "Copy A/B generado"

#### Sección 4 — Elegir copy
- **Activa:** Dos cards (Versión A / Versión B) con sus elementos. Botón "Confirmar Versión X".
- **Completada:** resumen "Versión {A|B} confirmada"

#### Sección 5 — Generar anuncio
- **Se activa automáticamente** cuando step=4 (sin botón adicional para empezar)
- **Generando (SSE):**
  - Loading bar con porcentaje y 5 etiquetas de estado: `prompt → imágenes → generando → guardando → listo`
  - Skeleton animado con aspect-ratio de la imagen
  - Spinner en header de sección
- **Listo:**
  - Imagen resultado full-width
  - Botones: "Descargar" (primary gradient) + "Nuevo anuncio" (ghost)
  - Input de ajuste: texto libre → "Aplicar" → llama `/refine-image` (POST normal, no SSE) → spinner en botón → nueva imagen reemplaza la anterior

### Estados de carga por sección
- Durante llamada API → spinner visible en el header de la sección activa
- Durante generación (sección 5) → loading bar de 4 segmentos con animación de pulso en el segmento activo

---

## Dependencias

### Agregar
```json
"@google/genai": "^2.6.0"
```

### Revisar para eliminar
- `@vercel/blob` — eliminar si ningún otro tool del hub la usa
- `openai` — eliminar si ningún otro tool la usa

### Variable de entorno nueva
```
GOOGLE_API_KEY=AIza...
```

---

## Archivos afectados

```
Nuevos:
  lib/gemini.ts
  lib/storage.ts
  components/tools/generador-anuncios/AdWizard.tsx
  components/tools/generador-anuncios/sections/Section1Reference.tsx
  components/tools/generador-anuncios/sections/Section2Product.tsx
  components/tools/generador-anuncios/sections/Section3Comments.tsx
  components/tools/generador-anuncios/sections/Section4Copy.tsx
  components/tools/generador-anuncios/sections/Section5Generate.tsx
  components/tools/generador-anuncios/AccordionSection.tsx
  app/api/sessions/[id]/generate-copy/route.ts
  app/api/sessions/[id]/refine-image/route.ts

Modificados:
  app/tools/generador-anuncios/page.tsx
  lib/types.ts
  lib/db.ts
  store/wizard.ts
  package.json
  .env.local.example

Reemplazados (mismo path, contenido nuevo):
  app/api/sessions/[id]/analyze-reference/route.ts
  app/api/sessions/[id]/analyze-product/route.ts
  app/api/sessions/[id]/confirm-copy/route.ts
  app/api/sessions/[id]/generate-image/route.ts

Eliminados (ya no aplican):
  app/api/sessions/[id]/answers/route.ts
  lib/prompts/analyze-reference.ts
  lib/prompts/analyze-product.ts
  lib/prompts/generate-copy.ts
  lib/prompts/master-prompt.ts
  lib/golden-rules.ts
  lib/openai.ts
  components/tools/StepIndicator.tsx  (si no lo usan otros tools)
  components/tools/generador-imagenes/Step1Reference.tsx
  components/tools/generador-imagenes/Step2Product.tsx
  components/tools/generador-imagenes/Step3TikTok.tsx
  components/tools/generador-imagenes/Step4Copy.tsx
  components/tools/generador-imagenes/Step5Result.tsx
```

---

## Supabase: migración de schema

1. Crear tabla nueva `sessions` con el schema de este spec (o hacer DROP + CREATE si no hay datos en producción).
2. Crear bucket `ad-uploads` en Supabase Storage con acceso público.
3. Actualizar políticas RLS si aplica.

---

## Out of scope
- Los otros tools del hub (calculadora-costos, generador-branding, generador-landing, generador-video-ads) no se tocan.
- No se implementa autenticación de usuario ni historial de anuncios.
- No se implementa regeneración con múltiples variantes simultáneas.
