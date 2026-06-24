-- Generador de Landing — sesiones del wizard (brief → fotos → secciones → preview).
-- Espeja branding_sessions: una fila por sesión, las imágenes viven en Storage
-- (bucket ad-uploads, prefijo {id}/). Cada sección elegida se genera como IMAGEN.

create table if not exists landing_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  step int not null default 0,

  -- Etapa 1: brief del producto
  product_name text,
  price text,                 -- precio / oferta (texto libre: "S/89", "2x1")
  benefits text,              -- beneficios clave (texto libre)
  audience text,              -- público objetivo

  tone jsonb,                 -- string[] (chips de tono)

  -- Etapa 2: fotos del producto (1-3, entran como input a Gemini)
  product_photo_urls jsonb,   -- string[] urls

  -- Etapa 3: secciones elegidas + copy aprobado (gate)
  selected_sections jsonb,    -- SectionType[]
  copy jsonb,                 -- SectionCopy[] aprobado

  -- Etapa 4: imágenes generadas por sección
  sections jsonb              -- [{ type, order, copy, imageUrl, status }]
);

-- RLS sin políticas: todo el acceso va por las API routes con service role (que
-- ignora RLS). La anon key queda bloqueada de leer/escribir. Espeja branding_sessions.
alter table public.landing_sessions enable row level security;

-- Selección de plantilla visual (id de TEMPLATES en lib/landing/templates.ts).
alter table public.landing_sessions add column if not exists template text;
