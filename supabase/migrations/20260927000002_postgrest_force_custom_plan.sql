-- Los índices PARCIALES del serving (`idx_ph_raw_clusters_monoproducto`,
-- `idx_ph_raw_clusters_relleno`) solo sirven si el planner puede probar su
-- predicado contra la consulta. PostgREST manda los filtros como parámetros
-- (`NOT status = ANY ($5)`, visto en pg_stat_statements) y reutiliza prepared
-- statements: tras ~5 ejecuciones en la misma conexión Postgres puede pasar al
-- plan GENÉRICO, que no puede probar un predicado contra un `$n`. Medido
-- 2026-09-26 con `force_generic_plan`: la consulta de relleno de Hogar+MX
-- vuelve a `idx_ph_raw_clusters_bucket` y tarda 3,6 s con apenas 10 nichos (el
-- genérico estima 1 fila, así que le parece barato y lo elegiría).
--
-- `force_custom_plan` planifica con los valores reales en cada ejecución:
-- unos ms de planning por consulta a cambio de que los parciales se usen.
-- `authenticator` es el rol con el que conecta PostgREST (ahí vive también el
-- statement_timeout de 8 s); `service_role` es el que asume por request.
-- Aplicado en prod el 2026-09-26 (~23:50 hora de Lima), con
-- `notify pgrst, 'reload config'`. Las conexiones ya abiertas lo toman al
-- reconectar.
alter role authenticator set plan_cache_mode = force_custom_plan;
alter role service_role set plan_cache_mode = force_custom_plan;
