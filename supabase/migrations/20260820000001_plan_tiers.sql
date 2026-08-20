-- Tres planes en vez de uno. El tier decide qué rangos del buscador se
-- desbloquean, cuántos productos se sirven por rango y cuántos créditos de
-- imagen entran en el período. La tabla de planes vive en código
-- (apps/web/lib/plans.ts): son 3 filas fijas que cambian con un deploy, no
-- datos que alguien edite en runtime.
--
-- default 1 y NOT NULL: una fila legada (escrita por el webhook antes de este
-- cambio) es una suscripción real que hay que seguir respetando, y el tier más
-- bajo es el único default seguro — inflar a 3 regalaría el plan caro.
alter table public.user_entitlements
  add column if not exists tier smallint not null default 1;

-- Ajustes por usuario. Hoy solo guarda la API key de KIE que trae el usuario
-- para el generador de video (BYOK: el render lo paga él, no el hub).
--
-- ⚠️ La key se guarda en claro, igual que el resto de secretos de este proyecto
-- viven en env. RLS on sin políticas → solo el service role la lee, que es el
-- mismo blindaje que ya tiene todo lo demás. Si algún día hace falta cifrarla,
-- el lugar es pgsodium/Vault, no una columna nueva.
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  kie_api_key text,
  updated_at  timestamptz not null default now()
);
alter table public.user_settings enable row level security;

-- Antigüedad del anuncio: unix seconds del anuncio MÁS VIEJO del anunciante en
-- ese nicho. Es el dato que el buscador nunca guardó: `scraped_at` es cuándo
-- scrapeamos nosotros (42.867 filas en 4 días de agosto), no cuánto lleva
-- corriendo el anuncio, y las reglas de oro del proyecto hablan de días
-- corriendo. `ssr-fetch.ts` ya parsea `start_date` por anuncio y lo tiraba.
--
-- Nace NULL en las ~70k filas existentes y se rellena a medida que el worker
-- re-scrapea. Por eso TODO filtro de antigüedad tiene que incluir los NULL
-- (ver `antiquityFilter` en packages/shared/db.ts): sin eso el filtro deja la
-- vitrina vacía hasta que termine el backfill.
alter table public.ph_raw_products
  add column if not exists ad_start_date bigint;
