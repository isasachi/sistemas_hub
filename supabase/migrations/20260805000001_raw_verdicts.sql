-- ════════════════════════════════════════════════════════════════════════════
-- El pipeline nuevo (físico → rango → mayoría del producto) pasa a ser el motor
-- del buscador. Sus veredictos viven junto al producto, en ph_raw_products.
--
-- ph_products / ph_pe_pool / ph_niches NO se tocan: quedan intactas con su data
-- por si hay que volver al pipeline anterior.
-- ════════════════════════════════════════════════════════════════════════════

alter table ph_raw_products
  add column if not exists status       text not null default 'pendiente',
  -- pendiente | monoproducto | sin_verificar | descartado
  add column if not exists kind         text,      -- fisico|digital|servicio|contenido|indeterminado
  add column if not exists share        real,      -- parte de la página que es este producto
  add column if not exists product_name text,      -- lo que el modelo identificó
  add column if not exists verdict_note text,
  add column if not exists verified_at  timestamptz;

-- Serving: por nicho y rango, solo lo que se muestra. El rango se filtra por
-- ad_count, así que el índice lo cubre.
create index if not exists idx_ph_raw_products_serving
  on ph_raw_products(niche, status, ad_count desc);

-- Cola de verificación: los pendientes, más viejos primero.
create index if not exists idx_ph_raw_products_pending
  on ph_raw_products(status, scraped_at) where status = 'pendiente';

-- ── Serving con economía del visto ───────────────────────────────────────────
-- Mismo criterio que ph_unseen_products (el del buscador viejo): no excluye,
-- HUNDE lo visto hace poco y lo re-muestra tras 7 días. Así cada usuario ve
-- productos distintos sin que el pool se le vacíe nunca.
-- El id de "visto" es '<nicho>:<page_id>' — ph_user_seen.product_id es texto
-- libre, sin FK, así que convive con los ids del buscador viejo.
create or replace function ph_raw_unseen(
  p_niche text,
  p_user  text,
  p_min   int,
  p_max   int,          -- -1 = sin techo (rango "100 a más")
  p_limit int default 10
)
returns setof ph_raw_products
language sql
stable
as $$
  select p.*
  from ph_raw_products p
  left join ph_user_seen s
    on s.user_id = p_user and s.product_id = p.niche || ':' || p.page_id
  where p.niche = p_niche
    and p.status = 'monoproducto'
    and p.ad_count >= p_min
    and (p_max < 0 or p.ad_count < p_max)
  order by
    (s.product_id is null or s.seen_at < now() - interval '7 days') desc,  -- frescos para ti
    p.ad_count desc,
    p.page_id
  limit p_limit;
$$;
