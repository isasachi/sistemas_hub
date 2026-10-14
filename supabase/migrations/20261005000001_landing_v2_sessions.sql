-- Landing Generator v2 (wizard v2 + chat): una fila por sesión. Todo el estado del núcleo
-- (`LandingSession` de apps/web/lib/landing-v2/schemas.ts) va en `session` jsonb y la conversación
-- del chat (UIMessage[] del AI SDK) en `messages`. Las imágenes viven en Storage (bucket
-- ad-uploads, prefijo {id}/), igual que landing_sessions.
create table if not exists public.landing_v2_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id text not null,
  view text not null check (view in ('wizard', 'chat')),
  session jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb
);

create index if not exists landing_v2_sessions_user_idx
  on public.landing_v2_sessions (user_id, created_at desc);

-- RLS sin políticas: todo el acceso va por las API routes con service role. Espeja landing_sessions.
alter table public.landing_v2_sessions enable row level security;
