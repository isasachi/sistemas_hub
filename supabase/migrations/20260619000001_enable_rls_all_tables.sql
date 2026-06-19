-- Seguridad — cierra la exposición vía PostgREST/anon key.
-- Todo el acceso a estas tablas va por las API routes con SUPABASE_SERVICE_ROLE_KEY
-- (que ignora RLS). El cliente solo usa la anon key para supabase.auth.*, nunca .from()
-- sobre estas tablas. Por eso prender RLS SIN políticas es seguro: el server (service
-- role) sigue funcionando y la anon key queda bloqueada de leer/escribir filas.

alter table public.ph_products      enable row level security;
alter table public.ph_niches        enable row level security;
alter table public.ph_user_seen     enable row level security;
alter table public.ph_pe_pool       enable row level security;
alter table public.ph_watchlist     enable row level security;
alter table public.ph_hunt_results  enable row level security;
alter table public.ph_user_searches enable row level security;
alter table public.branding_sessions enable row level security;

-- sessions ya tenía RLS, pero la política allow_all (USING true) la dejaba abierta.
-- La quitamos: RLS queda enabled sin políticas → solo service role accede.
drop policy if exists allow_all on public.sessions;
