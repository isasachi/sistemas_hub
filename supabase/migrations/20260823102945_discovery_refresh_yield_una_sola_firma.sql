-- ⚠️ POSTGRES SOBRECARGA POR FIRMA: el `CREATE OR REPLACE` de arriba NO
-- reemplaza la versión de un solo parámetro, la deja al lado. Con las dos vivas
-- una llamada por `p_since` a secas es AMBIGUA y PostgREST responde "function is
-- not unique" — o sea el scheduler volvería a morir antes de encolar, que es
-- exactamente el fallo que todo esto vino a arreglar. Verificado contra
-- `pg_proc`: quedaban `(interval)` y `(interval,text[])`.
DROP FUNCTION IF EXISTS disc_refresh_yield(INTERVAL);
