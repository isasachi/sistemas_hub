-- ⚠️ EL COSTO DOMINANTE ERA TRAER `page_id` DE UNA FILA ANCHA, 11.000 VECES.
--
-- `disc_refresh_yield` mapea cada descubrimiento a la página de su anunciante, y
-- lo hacía con un Index Scan sobre `disc_ads_pkey`: el índice da el puntero y
-- después hay que ir al heap, donde la fila trae titular, cuerpo y URL. Medido
-- con `EXPLAIN (ANALYZE, BUFFERS)` sobre la ventana de 2 h: **11.193 loops,
-- 46.881 buffers y ~1.286 ms de los 1.450 ms totales — el 89%**.
--
-- Con `page_id` dentro del índice el acceso es index-only y no toca el heap.
-- Medido de punta a punta: **4,32 s → 0,97 s**.
--
-- ⚠️ Y ESTO NO CIERRA EL PROBLEMA, SOLO LO ABARATA. El costo crece con los
-- descubrimientos de la VENTANA, o sea con lo que el motor produce — que es
-- justo lo que este motor existe para maximizar. Medido en dos horas de daemon
-- acelerando: 0,10 s con ~1.000 descubrimientos en la ventana, 4,32 s con
-- 10.562. Lo que garantiza que el motor no se pare es `scheduler.ts`, que ya no
-- muere si el refresco falla.
CREATE INDEX IF NOT EXISTS disc_ads_id_page_idx ON disc_ads (id) INCLUDE (page_id);

ANALYZE disc_ads;
ANALYZE disc_ad_discoveries;
