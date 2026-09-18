-- El primer escalón del serving por categoría (`getApprovedByCategory`) pide
-- `status = 'monoproducto'` ordenado por `ad_count desc, page_id`. Sin este
-- índice el planner recorre `idx_ph_raw_clusters_ads` y filtra en el heap: en
-- el rango 0-50 hay 232 monoproducto entre ~375k filas, así que tiene que leer
-- casi todas para juntar 200. Medido 2026-09-18 en prod: 61,8 s, 164k buffers,
-- 375k filas descartadas por el filtro, y 18 de 25 consultas con `57014`
-- (el statement_timeout de 8 s). El índice parcial cubre ~1.1k filas.
--
-- CONCURRENTLY: el worker escribe en esta tabla 24/7. No corre dentro de una
-- transacción, así que se aplica suelto (SQL editor / psql), no con un runner
-- que envuelva el archivo en BEGIN/COMMIT.
create index concurrently if not exists idx_ph_raw_clusters_monoproducto
  on public.ph_raw_clusters (ad_count desc, page_id)
  where status = 'monoproducto';
