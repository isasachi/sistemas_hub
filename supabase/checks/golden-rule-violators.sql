-- Monitoreo de las REGLAS DE ORO de ph_products (no-enforcing). Correr ad-hoc
-- (Supabase SQL editor / MCP execute_sql) para detectar drift o bugs de escritura.
--
-- Esperado: 0 en las tres columnas (baseline 2026-06-22: 0/0/0 sobre 11374 filas).
--
-- ⚠️ A PROPÓSITO NO es un CHECK constraint: upsertProducts reescribe raw_data en
-- cada re-scrape (PH_REFRESH_DAYS=7), y un activo que baja de 40 ads haría fallar
-- el UPDATE. El drift en la TABLA es esperado por diseño; toCard (serving) oculta
-- las filas que violan las reglas. Esta query solo VIGILA, no bloquea escrituras.
select
  count(*) filter (where (raw_data->>'ad_count')::numeric < 40)                  as bajo_40_ads,
  count(*) filter (where (raw_data->>'days_running') is null
                      or (raw_data->>'days_running')::numeric < 10)               as bajo_10_dias,
  count(*) filter (where raw_data->>'found_country' = 'PE')                       as pautado_pe,
  count(*)                                                                        as total_productos
from ph_products;
