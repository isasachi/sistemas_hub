-- Generador de Branding — sesiones del wizard (brief → dirección → logo → etiqueta → mockup → guía).
-- Espeja el patrón de la tabla `sessions` (generador-anuncios) pero con su propio esquema:
-- una fila por sesión, las imágenes viven en Storage (bucket ad-uploads, prefijo {id}/).

create table if not exists branding_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  step int not null default 0,

  -- Etapa 1: brief (información pequeña que pide la tool)
  brand_name text,
  product_category text,
  target_audience text,
  personality jsonb,          -- string[] (chips de personalidad de marca)
  brief_notes text,

  -- Etapa 2: dirección (gate de aprobación — paleta + tipografía + concepto)
  direction jsonb,            -- DirectionSchema

  -- Etapa 3: logo (genera 3-4, el usuario elige uno)
  logo_options jsonb,         -- string[] urls de las opciones generadas
  logo_url text,              -- url del logo elegido

  -- Etapa 4: etiqueta
  label_brief text,
  label_url text,

  -- Etapa 5: mockup del producto final
  container_mode text,        -- 'describe' | 'upload'
  container_desc text,
  container_url text,         -- imagen del envase subida por el usuario (nullable)
  mockup_url text
);
