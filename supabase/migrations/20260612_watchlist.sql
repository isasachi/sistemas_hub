-- ════════════════════════════════════════════════════════════════════════════
-- Plan 13 parte E: watchlist de casi-ganadores.
-- Productos descartados por las reglas de oro pero con tracción (≥20 ads y ≥5
-- días) se guardan acá en vez de perderse. El cron los re-chequea: si maduran
-- (≥40 ads · ≥10 días) se promueven a ph_products. Inventario futuro casi gratis.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists ph_watchlist (
  id           text primary key,             -- ad_archive_id de Meta
  niche        text not null,
  page_id      text,
  name         text,
  raw_data     jsonb not null,               -- snapshot del enrich (mismo shape que ph_products.raw_data)
  reason       text not null,                -- oro_pocos_anuncios | oro_muy_reciente
  first_seen   timestamptz not null default now(),
  last_checked timestamptz not null default now()
);

create index if not exists idx_ph_watchlist_niche   on ph_watchlist(niche);
create index if not exists idx_ph_watchlist_checked on ph_watchlist(last_checked);
