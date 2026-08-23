-- `disc_refresh_yield` gana `p_terms`: refrescar UNA lista de términos.
--
-- ⚠️ EXISTE POR `podar`, QUE NO ES UN BANDIT. La ventana de `p_since` se
-- justificó con que `yield_rate` alimenta al bandit —una prioridad, no un
-- saldo—, y eso es cierto para `pickNextBatch`. Es FALSO para `podar`, que
-- convierte ese mismo número en `is_active = false`. Y un término apagado sale
-- del bandit, así que no vuelve a correr, así que no vuelve a entrar en
-- `tocados`: su cero viejo no se corrige NUNCA. Puerta de una sola dirección,
-- reversible solo a mano.
--
-- El camino alcanzable es la deriva ya documentada: una página descubierta bajo
-- el término A y rankeada bajo el B refresca a B y no a A. Si A quedó en
-- `runs >= 5, yield_rate = 0`, la poda apaga un término que sí rendía. Medido en
-- vivo: `rodillera ajustable`/PE con yield 0 y 3 filas en `disc_ranked`.
--
-- Por eso `podar` refresca SUS candidatos —un puñado de términos, no 78.000
-- descubrimientos— y recién entonces decide. Se acota por término en vez de
-- llamar al recálculo completo porque ese completo son 3,4 s de un presupuesto
-- de 8 y crece con la tabla: es una válvula que caduca sola.
--
-- Sin NINGÚN filtro (`p_since` y `p_terms` en NULL) se recalcula todo: backfill.
CREATE OR REPLACE FUNCTION disc_refresh_yield(
    p_since INTERVAL DEFAULT NULL,
    p_terms TEXT[]  DEFAULT NULL
)
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
        UNION
        SELECT DISTINCT unnest(p_terms)
        WHERE p_terms IS NOT NULL
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
        WHERE (p_since IS NULL AND p_terms IS NULL)
           OR r.seed_query IN (SELECT term FROM tocados)
        GROUP BY r.seed_query, q.country
    ),
    -- Las páginas ya rankeadas se materializan UNA vez (~200 filas) en vez de
    -- preguntarse con un EXISTS correlacionado por cada grupo.
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
        WHERE (p_since IS NULL AND p_terms IS NULL)
           OR r.seed_query IN (SELECT term FROM tocados)
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
