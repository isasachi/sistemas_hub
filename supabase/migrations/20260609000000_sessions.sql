-- Generador de Anuncios — la tabla `sessions`.
--
-- ⚠️ ESTA TABLA EXISTÍA EN PRODUCCIÓN SIN NINGUNA MIGRACIÓN QUE LA CREARA. Es la tool
-- más vieja del hub: la tabla se creó a mano y el repo nunca la declaró. Se notaba en
-- que `20260708000001_session_history.sql` la toca detrás de un
-- `if to_regclass('public.sessions') is not null` — o sea el propio repo ya sabía que
-- podía no existir. Consecuencia: cualquier entorno nuevo (branch de Supabase, restore,
-- clon para desarrollo) dejaba `generador-anuncios` en 500 en TODAS sus rutas, y sus
-- 17 columnas no estaban declaradas en ningún lado.
--
-- Las columnas y sus tipos están transcritos de `information_schema.columns` del
-- proyecto de producción (2026-08-21), no del tipo `SessionResponse`: el tipo dice lo
-- que el código espera, la tabla dice lo que hay.
--
-- ⚠️ La fecha del nombre la coloca ANTES de `20260708000001_session_history.sql`, que
-- es su dependencia real. No es una migración nueva: es la declaración retroactiva de
-- algo que ya existe, y por eso es enteramente `if not exists` — aplicarla contra una
-- base que ya la tiene no hace nada.
--
-- ⚠️ NO la apliques con `supabase db push` contra producción. El ledger de
-- `supabase_migrations.schema_migrations` de prod no coincide con los nombres de este
-- folder (las migraciones se aplicaron con `apply_migration`, que genera sus propios
-- timestamps), así que un push intentaría correr las 57 desde cero.

create table if not exists public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  step               integer not null default 0,
  -- Paso 1 — anuncio de referencia
  reference_url      text,
  reference_analysis jsonb,
  -- Paso 2 — producto y logo
  product_url        text,
  logo_url           text,
  product_scan       jsonb,
  product_name       text,
  what_it_does       text,
  target_audience    text,
  -- Paso 3 — comentarios de TikTok
  tiktok_comments    text,
  -- Paso 4 — copy
  copy_versions      jsonb,
  confirmed_copy     jsonb,
  -- Paso 5 — imagen
  edit_instruction   text,
  image_url          text,
  -- Identidad del dueño. TEXT y no UUID a propósito: es `readUserId()`, que puede ser
  -- el id de Supabase Auth o el de la cookie anónima `ph_uid`.
  user_id            text
);

-- El historial lista por dueño y ordena por fecha (`listSessions`).
-- ⚠️ El nombre es el que YA tiene producción (`pg_indexes`, 2026-08-21), no uno nuevo:
-- con otro nombre el `if not exists` no reconocería el índice existente y una aplicación
-- futura crearía un segundo índice idéntico sobre las mismas columnas.
create index if not exists sessions_user_hist_idx
  on public.sessions (user_id, created_at desc);

-- Mismo blindaje que el resto del proyecto: RLS activa y SIN políticas, así que solo
-- el service role llega. El hub entra siempre con la service key.
alter table public.sessions enable row level security;
