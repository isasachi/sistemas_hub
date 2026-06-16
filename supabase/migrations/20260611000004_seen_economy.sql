-- ════════════════════════════════════════════════════════════════════════════
-- Economía del "visto": de exclusión dura a penalización de ranking.
-- Antes: ph_unseen_products EXCLUÍA lo visto → con un pool chico (reglas de oro)
-- un solo usuario lo agotaba en 2 búsquedas y caía en respuesta vacía/pending.
-- Ahora: nada se excluye — lo visto-hace-poco se hunde al fondo y RE-APARECE tras
-- SEEN_TTL (7 días). El pool nunca se "vacía" para un usuario.
-- (El nombre de la función se conserva para no tocar callers; ver db.ts.)
-- ════════════════════════════════════════════════════════════════════════════

-- Productos del nicho, rankeados: frescos-para-el-usuario primero (nunca vistos,
-- o vistos hace > 7 días), luego por score. NO excluye nada → nunca vacío si el
-- nicho tiene inventario fresco.
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
  left join ph_user_seen s
    on s.user_id = p_user and s.product_id = p.id
  where p.niche = p_niche
    and p.scraped_at > now() - interval '30 days'
  order by
    (s.product_id is null or s.seen_at < now() - interval '7 days') desc,  -- frescos-para-ti primero
    p.score desc nulls last,
    p.scraped_at desc
  limit p_limit;
$$;

-- Cuántos GANADORES (alta/media, que pasan las reglas de oro) son frescos para
-- este usuario. Es el número honesto de "nuevos para ti" que muestra la UI —
-- 0 = ya viste todos los ganadores recientes (la UI re-muestra, no vacía).
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
  left join ph_user_seen s
    on s.user_id = p_user and s.product_id = p.id
  where p.niche = p_niche
    and p.scraped_at > now() - interval '30 days'
    and p.score is not null
    and (p.analysis->>'priority') in ('alta','media')
    and coalesce((p.raw_data->>'ad_count')::numeric, 0) >= 40
    and coalesce((p.raw_data->>'days_running')::numeric, -1) >= 10
    and coalesce(p.raw_data->>'found_country', '') <> 'PE'
    and (s.product_id is null or s.seen_at < now() - interval '7 days');
$$;
