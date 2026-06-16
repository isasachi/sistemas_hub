-- ════════════════════════════════════════════════════════════════════════════
-- Reglas de oro: ph_products SOLO contiene candidatos válidos
--   (≥40 ads · ≥10 días activos · NO pautados en Perú)
-- El pool de competidores PE se muda a su propia tabla: sigue alimentando el
-- matching de competencia del análisis, pero ya no se analiza con LLM ni
-- llega a la UI como "producto".
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists ph_pe_pool (
  id         text primary key,             -- ad_archive_id de Meta
  niche      text not null,
  page_id    text,
  name       text,                          -- nombre del anunciante
  raw_data   jsonb not null,                -- misma forma que ph_products.raw_data
  scraped_at timestamptz not null default now()
);

create index if not exists idx_ph_pe_pool_niche on ph_pe_pool(niche);

-- Mover el pool PE existente fuera de ph_products
insert into ph_pe_pool (id, niche, page_id, name, raw_data, scraped_at)
select id, niche, page_id, name, raw_data, scraped_at
from ph_products
where raw_data->>'found_country' = 'PE'
on conflict (id) do nothing;

delete from ph_products where raw_data->>'found_country' = 'PE';

-- Purga de productos guardados que violan las reglas de volumen/antigüedad
delete from ph_products
where coalesce((raw_data->>'ad_count')::numeric, 0) < 40
   or coalesce((raw_data->>'days_running')::numeric, -1) < 10;
