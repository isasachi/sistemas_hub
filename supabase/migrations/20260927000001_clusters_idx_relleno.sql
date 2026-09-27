-- El segundo escalón del serving por categoría (`getApprovedByCategory`): el
-- RELLENO, `status not in (inactivo,descartado,monoproducto)` ordenado por
-- `ad_count desc, page_id`, limit `VENTANA_CAT` (800). En el rango 0-50 el
-- 79 % de las filas es `descartado` (435k de 552k, crecieron con el sprint de
-- scan-nicho) e `idx_ph_raw_clusters_bucket (niche, ad_count)` las incluye: el
-- bitmap trae todas y el filtro las tira en el heap. Medido 2026-09-27 en prod,
-- Hogar + country=MX: 51k filas → 10,4k bloques (7,2k de disco) → quedan
-- 2.155, 9,0 s. Edge logs de 24 h: 16 × `57014`, TODOS de esta consulta en
-- 0-50 (12 con `country`); los éxitos promediaban ~5 s.
--
-- Clave: la de la doctrina `(ad_count desc, page_id)` —el ORDER BY, así el
-- scan corta al juntar 800— más `niche, country` al final como COLUMNAS DE
-- CLAVE (no INCLUDE): así `niche = ANY(...)` y `country = ...` son Index Cond y
-- se descartan dentro del índice, sin ir al heap. Medido con el índice puesto
-- (buffers): Hogar+MX 10.669 → 1.053 (1,1 s), Salud sin país 774 (0,4 s),
-- Salud+US 757, "todos"+PE 929, "todos" 762, categoría 100+ 290. Monoproducto
-- sigue en su propio índice.
--
-- CONCURRENTLY: el worker escribe en esta tabla 24/7. No corre dentro de una
-- transacción, así que se aplica suelto (SQL editor / psql), no con un runner
-- que envuelva el archivo en BEGIN/COMMIT. Aplicado en prod el 2026-09-27.
create index concurrently if not exists idx_ph_raw_clusters_relleno
  on public.ph_raw_clusters (ad_count desc, page_id, niche, country)
  where status not in ('inactivo', 'descartado', 'monoproducto');
