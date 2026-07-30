-- ════════════════════════════════════════════════════════════════════════════
-- Buscador SIMPLE (tool de TESTEO, temporal) — sin reglas de oro y sin LLM.
--
-- Tablas propias a propósito: ph_products / ph_pe_pool siguen bajo las tres
-- reglas de oro (≥40 ads · ≥10 días · no PE) y nada de acá las toca. Para
-- desmontar la tool basta `drop table ph_raw_products, ph_raw_niches`.
--
-- PK (niche, page_id): un anunciante = una entrada por nicho. NO ad_archive_id
-- como ph_products — acá no hay enrich y el ad_id es solo "el primer ad del
-- grupo", así que un re-scrape traería otro y duplicaría la fila.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists ph_raw_niches (
  id           text primary key,
  status       text not null default 'pending',   -- pending | active
  last_scraped timestamptz
);

create table if not exists ph_raw_products (
  niche      text not null,
  page_id    text not null,
  ad_id      text,
  name       text,                                -- nombre del anunciante
  ad_count   integer not null default 0,          -- de la card (collation), para el agrupado
  country    text,
  raw_data   jsonb not null default '{}'::jsonb,  -- title/body/keyword/categories
  scraped_at timestamptz not null default now(),
  primary key (niche, page_id)
);

-- Agrupado por rango de anuncios: filtro por nicho + orden/rango por ad_count.
create index if not exists idx_ph_raw_products_bucket
  on ph_raw_products(niche, ad_count desc);

-- Mismo criterio que 20260619000001: RLS on sin políticas → solo service role.
alter table public.ph_raw_niches   enable row level security;
alter table public.ph_raw_products enable row level security;
