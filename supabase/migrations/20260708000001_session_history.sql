-- Historial de sesiones por usuario para las tools de marketing.
-- Hasta ahora una sesión se recuperaba solo por su id (guardado en localStorage /
-- cookie sid), sin vínculo con el usuario. Añadimos user_id (text: acepta el uuid de
-- Supabase Auth O el de la cookie anónima ph_uid, igual que ph_gen_usage) + índice
-- para listar el historial de cada usuario. Sin backfill: las sesiones anónimas
-- previas no aparecen en el historial (siguen reanudables vía localStorage).

-- sessions (generador-anuncios) es LEGADA: no se crea en ninguna migración de este
-- repo, así que la tocamos con guard por si no existe en un entorno dado.
do $$ begin
  if to_regclass('public.sessions') is not null then
    alter table public.sessions add column if not exists user_id text;
    create index if not exists sessions_user_hist_idx
      on public.sessions (user_id, created_at desc);
  end if;
end $$;

alter table public.branding_sessions add column if not exists user_id text;
create index if not exists branding_sessions_user_hist_idx
  on public.branding_sessions (user_id, created_at desc);

alter table public.landing_sessions add column if not exists user_id text;
create index if not exists landing_sessions_user_hist_idx
  on public.landing_sessions (user_id, created_at desc);

-- Calculadora de costos: nueva tabla (antes no persistía nada). Se guarda al llegar
-- al resultado. `inputs` = CalcInputs completo (lib/calculadora-costos/model.ts);
-- `snapshot` = KPIs para el preview de la card sin recalcular en el listado.
create table if not exists calc_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id text not null,
  inputs jsonb not null,
  snapshot jsonb not null
);

-- RLS sin políticas: acceso solo por API routes con service role (espeja las demás).
alter table public.calc_sessions enable row level security;

create index if not exists calc_sessions_user_hist_idx
  on public.calc_sessions (user_id, created_at desc);
