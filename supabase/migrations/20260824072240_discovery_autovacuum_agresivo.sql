-- ⚠️ EL TIMEOUT DEL REFRESCO NO ERA EL HISTORIAL: ERA EL MAPA DE VISIBILIDAD.
--
-- `disc_refresh_yield` resuelve `ad_id → page_id` con el índice de cobertura
-- `disc_ads_id_page_idx`, que solo evita el heap si la página está marcada
-- "todo visible". Con el autovacuum por defecto (20% de la tabla) y un motor que
-- escribe sin parar, `disc_ads` acumuló **14.960 tuplas muertas (17,8%)** y el
-- último autovacuum había sido 6 horas antes: medido con EXPLAIN, `Heap Fetches:
-- 2763` de 5.496 y **19.252 buffers** en ese nodo.
--
-- Medido sobre el término más gordo (`multivitaminico`, 5.496 descubrimientos):
--   antes del VACUUM  → 10,13 s (por encima del statement_timeout de 8 s)
--   después           →  2,75 s
--   ventana de 2 h    →  0,27 s
--
-- ⚠️ Y LA CONSULTA EN SÍ SIEMPRE FUE RÁPIDA: el mismo cálculo aislado con
-- EXPLAIN ANALYZE da **403 ms**. Lo que variaba entre 0,4 s y 10 s era el estado
-- de vacuum y la contención con el daemon, no el costo del historial.
--
-- ⚠️ DOS DIAGNÓSTICOS ANTERIORES DE ESTE MISMO FALLO ESTABAN EQUIVOCADOS, y los
-- dos por el mismo motivo: se midió el tiempo de punta a punta bajo estados de
-- vacuum distintos y se leyó la variación como si fuera costo de la consulta.
--   1. «el recálculo completo no escala» → llevó a acotar por ventana
--   2. «el historial de un término gordo no entra» → llevó a refrescar de a uno
-- Las dos mitigaciones son correctas y se quedan (menos trabajo, presupuesto de
-- reloj), pero ninguna era la causa. **Ante un tiempo que varía 25× para el
-- mismo trabajo, mirar `pg_stat_user_tables` y `EXPLAIN (ANALYZE, BUFFERS)`
-- ANTES de cambiar la consulta.**
--
-- Con 2% en vez de 20%, el autovacuum entra ~10× más seguido y el mapa de
-- visibilidad se mantiene fresco. `disc_ad_discoveries` es solo-inserción pero
-- también necesita vacuum para ese mapa.
ALTER TABLE disc_ads SET (
    autovacuum_vacuum_scale_factor  = 0.02,
    autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE disc_ad_discoveries SET (
    autovacuum_vacuum_scale_factor  = 0.02,
    autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE disc_ranked SET (
    autovacuum_vacuum_scale_factor  = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);
