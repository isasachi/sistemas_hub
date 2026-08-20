-- Suscripción vía Whop. El webhook (/api/whop/webhook) es la ÚNICA escritura;
-- el hub solo lee. Nunca se consulta la API de Whop en el path de request.
--
-- La PK es el membership de Whop, no un id propio: la entrega de webhooks es
-- at-least-once con reintentos ~3 días, así que el mismo evento llega repetido.
-- Con esta PK el handler es un upsert y la idempotencia sale de la tabla, no de
-- lógica que se pueda olvidar en el camino.
create table if not exists public.user_entitlements (
  whop_membership_id  text primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  status              text not null,
  renewal_period_end  timestamptz,
  updated_at          timestamptz not null default now()
);

-- El gate lee por usuario en cada carga del área privada.
create index if not exists user_entitlements_user_id_idx
  on public.user_entitlements (user_id);

-- Misma convención que 20260619000001: RLS prendido SIN políticas.
-- El server usa SUPABASE_SERVICE_ROLE_KEY (ignora RLS); la anon key queda afuera.
alter table public.user_entitlements enable row level security;
