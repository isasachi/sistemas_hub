-- Generador de Video Ads — una fila por sesión del wizard (espeja landing_sessions /
-- branding_sessions). Tres líneas de entrada conviven en la misma tabla, discriminadas
-- por `mode`; las columnas de la línea que no aplica quedan NULL.
--
--   video-ref      → reference_video_url + forensic_analysis  (guión por plantilla)
--   character-ref  → character_url subido por el usuario      (guión desde cero)
--   character-gen  → character_brief → character_url generado (guión desde cero)
--
-- El render corre en KIE (Grok Imagine 1.5) de forma asíncrona: guardamos kie_task_id
-- y el cliente hace polling. El taskId SIEMPRE se lee de esta fila, nunca del cliente
-- (si no, /video-status sería un proxy abierto a la cuenta de KIE).

create table if not exists video_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id text,
  step int not null default 0,
  mode text,

  -- Fuente (según mode)
  reference_video_url text,
  forensic_analysis jsonb,      -- { durationSec, aspectRatio, beats[], persuasiveLogic, ... }
  character_brief jsonb,        -- CharacterBrief (género, edad, etnia, fondo, cámara, ...)
  character_url text,

  -- Producto
  product_url text,
  product_scan jsonb,
  product_name text,
  what_it_does text,
  target_audience text,

  -- Guión
  script_template jsonb,        -- esqueleto con blancos: { slots: [{ t, pattern, blanks }] }
  script_versions jsonb,        -- { versionA: beat[], versionB: beat[] }
  direction jsonb,              -- { accent, vibe, cameraMotion, eyeDirection }
  confirmed_script jsonb,       -- { version, beats[] }

  -- Render
  video_prompt text,
  duration int,
  kie_task_id text,
  video_status text,            -- waiting | queuing | generating | success | fail
  video_url text
);

-- RLS sin políticas: acceso solo por API routes con service role (espeja las demás).
alter table public.video_sessions enable row level security;

create index if not exists video_sessions_user_hist_idx
  on public.video_sessions (user_id, created_at desc);
