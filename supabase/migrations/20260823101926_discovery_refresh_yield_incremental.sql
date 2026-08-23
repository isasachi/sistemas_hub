-- `disc_refresh_yield` deja de recalcular TODO en cada ciclo.
--
-- ⚠️ EL RECÁLCULO COMPLETO NO ESCALA, Y EL TECHO SON 8 SEGUNDOS. El worker habla
-- por PostgREST con `service_role`, que hereda el `statement_timeout = 8s` de
-- `authenticator`. Con 78.128 descubrimientos el recálculo entero tarda 3,4 s
-- —ya arreglado el `EXISTS` por grupo de la migración anterior, que era lo que
-- lo había hecho reventar— y este motor existe justamente para que esa tabla
-- crezca, así que volvería a pasarse solo. Y cuando se pasa NO falla solo este
-- paso: el scheduler lanza antes de encolar, o sea el motor deja de repartir
-- trabajo.
--
-- `p_since` acota el recálculo a los términos que CAMBIARON: los que tuvieron
-- una corrida nueva (cambia `new_pages`) o una fila rankeada nueva (cambia
-- `qualified_pages`). Un término sin actividad conserva su valor, que ya es el
-- correcto. Medido: 15 términos y 0,10 s con ventana de 2 h, contra 3,4 s del
-- recálculo completo.
--
-- ⚠️ SIN ARGUMENTO SIGUE RECALCULANDO TODO, y ese camino tiene que quedar: es el
-- backfill y el que corrige la deriva de abajo.
--
-- ⚠️ DERIVA CONOCIDA, acotada a propósito: si una página descubierta bajo el
-- término A se rankea bajo el término B, el `qualified_pages` de A sube sin que
-- A tenga actividad, y con `p_since` no se entera hasta su próxima corrida. Se
-- tolera porque `yield_rate` alimenta un bandit —es una prioridad, no un saldo—
-- y porque el recálculo completo sigue a un `SELECT` de distancia.
--
-- ⚠️ HAY QUE DROPEAR LA VERSIÓN SIN ARGUMENTOS. Postgres sobrecarga por firma:
-- un `CREATE OR REPLACE` con parámetro nuevo deja las DOS, y `disc_refresh_yield()`
-- pasa a ser ambiguo.
DROP FUNCTION IF EXISTS disc_refresh_yield();

CREATE OR REPLACE FUNCTION disc_refresh_yield(p_since INTERVAL DEFAULT NULL)
RETURNS INT
LANGUAGE sql
AS $$
    WITH tocados AS (
        SELECT DISTINCT seed_query AS term
        FROM disc_search_runs
        WHERE p_since IS NOT NULL AND created_at > now() - p_since
        UNION
        SELECT DISTINCT seed_query
        FROM disc_ranked
        WHERE p_since IS NOT NULL AND ranked_at > now() - p_since
    ),
    por_combinacion AS (
        SELECT
            r.seed_query                          AS term,
            q.country::CHAR(2)                    AS country,
            count(DISTINCT r.id)                  AS runs,
            max(r.created_at)                     AS last_run_at,
            COALESCE(sum(q.ads_found), 0)::INT    AS total_results
        FROM disc_search_queries q
        JOIN disc_search_runs r ON r.id = q.run_id
        WHERE p_since IS NULL OR r.seed_query IN (SELECT term FROM tocados)
        GROUP BY r.seed_query, q.country
    ),
    -- Las páginas ya rankeadas se materializan UNA vez (son ~200 filas) en vez
    -- de preguntarse con un EXISTS por cada grupo.
    rankeadas AS (
        SELECT DISTINCT page_id FROM disc_ranked
    ),
    paginas AS (
        SELECT DISTINCT
            r.seed_query           AS term,
            d.country::CHAR(2)     AS country,
            a.page_id
        FROM disc_search_runs r
        JOIN disc_search_queries q ON q.run_id = r.id
        JOIN disc_ad_discoveries d ON d.query_id = q.id
        JOIN disc_ads a            ON a.id = d.ad_id
        WHERE p_since IS NULL OR r.seed_query IN (SELECT term FROM tocados)
    ),
    conteos AS (
        SELECT
            p.term,
            p.country,
            count(*)::INT              AS new_pages,
            count(rk.page_id)::INT     AS qualified_pages
        FROM paginas p
        LEFT JOIN rankeadas rk ON rk.page_id = p.page_id
        GROUP BY p.term, p.country
    ),
    upsert AS (
        INSERT INTO disc_keyword_country_state
            (term, country, last_run_at, runs, total_results, new_pages, qualified_pages, yield_rate)
        SELECT
            pc.term, pc.country, pc.last_run_at, pc.runs, pc.total_results,
            COALESCE(c.new_pages, 0), COALESCE(c.qualified_pages, 0),
            CASE WHEN COALESCE(c.new_pages, 0) > 0
                 THEN ROUND(COALESCE(c.qualified_pages, 0)::numeric / c.new_pages, 4)
                 ELSE 0 END
        FROM por_combinacion pc
        LEFT JOIN conteos c ON c.term = pc.term AND c.country = pc.country
        JOIN disc_keywords k ON k.term = pc.term
        ON CONFLICT (term, country) DO UPDATE SET
            last_run_at     = EXCLUDED.last_run_at,
            runs            = EXCLUDED.runs,
            total_results   = EXCLUDED.total_results,
            new_pages       = EXCLUDED.new_pages,
            qualified_pages = EXCLUDED.qualified_pages,
            yield_rate      = EXCLUDED.yield_rate
        RETURNING 1
    )
    SELECT COALESCE(count(*), 0)::INT FROM upsert;
$$;

CREATE INDEX IF NOT EXISTS disc_search_runs_seed_idx ON disc_search_runs (seed_query);
CREATE INDEX IF NOT EXISTS disc_ranked_ranked_at_idx ON disc_ranked (ranked_at);
