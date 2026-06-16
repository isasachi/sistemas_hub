-- ════════════════════════════════════════════════════════════════════════════
-- Buscador de Productos — schema
-- Tablas con prefijo ph_ para no colisionar con las del resto del hub.
-- Se accede siempre con el SERVICE_ROLE_KEY desde el servidor (bypassa RLS),
-- igual que la tabla `sessions` existente.
-- ════════════════════════════════════════════════════════════════════════════

-- Candidatos scrapeados de Meta Ads Library (pool compartido entre todos los usuarios)
create table if not exists ph_products (
  id           text primary key,             -- ad_archive_id de Meta
  niche        text not null,
  page_id      text,
  name         text,                          -- nombre del anunciante
  raw_data     jsonb not null,                -- ad_count, days_running, found_country, found_keyword, etc.
  score        real,                          -- 0-100, lo asigna el análisis Anthropic (null = sin analizar)
  analysis     jsonb,                         -- resultado del análisis (atributos, escenario PE, prioridad)
  scraped_at   timestamptz not null default now(),
  analyzed_at  timestamptz
);

create index if not exists idx_ph_products_niche   on ph_products(niche);
create index if not exists idx_ph_products_scraped  on ph_products(scraped_at);
create index if not exists idx_ph_products_score    on ph_products(niche, score desc nulls last);

-- Estado de cada nicho (pending = encolado para scrapear, active = ya poblado)
create table if not exists ph_niches (
  id            text primary key,             -- nombre del nicho (ej: "espalda")
  status        text not null default 'pending',
  last_scraped  timestamptz,
  product_count int  default 0
);

-- Qué productos ya vio cada usuario (para no repetírselos)
create table if not exists ph_user_seen (
  user_id     text not null,
  product_id  text not null,
  seen_at     timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists idx_ph_user_seen_user on ph_user_seen(user_id);

-- ─── RPC: productos no vistos por el usuario, frescos (TTL 30 días) ────────────
-- Mantiene el NOT IN en SQL — más eficiente que traer todo al cliente.
create or replace function ph_unseen_products(
  p_niche text,
  p_user  text,
  p_limit int default 20
)
returns setof ph_products
language sql
stable
as $$
  select p.*
  from ph_products p
  where p.niche = p_niche
    and p.scraped_at > now() - interval '30 days'
    and p.id not in (
      select product_id from ph_user_seen where user_id = p_user
    )
  order by p.score desc nulls last, p.scraped_at desc
  limit p_limit;
$$;

create or replace function ph_count_unseen(
  p_niche text,
  p_user  text
)
returns int
language sql
stable
as $$
  select count(*)::int
  from ph_products p
  where p.niche = p_niche
    and p.scraped_at > now() - interval '30 days'
    and p.id not in (
      select product_id from ph_user_seen where user_id = p_user
    );
$$;
