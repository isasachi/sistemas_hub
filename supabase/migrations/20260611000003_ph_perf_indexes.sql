-- ════════════════════════════════════════════════════════════════════════════
-- Buscador de Productos — índices de rendimiento + RPCs anti-join
-- Las queries de pipeline/serving filtran por expresiones JSONB sin índice
-- (full scan creciente con cada nicho sembrado). Aplicar en el dashboard.
-- ════════════════════════════════════════════════════════════════════════════

-- analysis->>'priority': countNicheWinners, getProductsToValidatePe,
-- getStrongDiscardsToValidate, getTopCountriesForNiche
create index if not exists idx_ph_products_priority
  on ph_products (niche, ((analysis->>'priority')));

-- raw_data->>'found_country': getPeCompetitors, getTopCountriesForNiche
create index if not exists idx_ph_products_country
  on ph_products (niche, ((raw_data->>'found_country')));

-- Pendientes de análisis (getProductsToAnalyze: score IS NULL + frescura).
-- Índice parcial: solo filas sin analizar — chico y siempre caliente.
create index if not exists idx_ph_products_unscored
  on ph_products (niche, scraped_at desc) where score is null;

-- ─── RPCs: NOT IN (subquery) → NOT EXISTS (anti-join) ─────────────────────────
-- NOT IN materializa la subquery y se degrada con el historial de ph_user_seen;
-- NOT EXISTS usa el PK (user_id, product_id) como anti-join.

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
    and not exists (
      select 1 from ph_user_seen s
      where s.user_id = p_user and s.product_id = p.id
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
    and not exists (
      select 1 from ph_user_seen s
      where s.user_id = p_user and s.product_id = p.id
    );
$$;
