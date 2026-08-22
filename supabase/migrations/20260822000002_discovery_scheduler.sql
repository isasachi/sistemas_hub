-- Spec §2.5, §2.6, §9 y §10: cola, vocabulario con bandit y recrawl adaptativo.
-- Es lo que convierte al motor de "una corrida por consulta" en el inventario
-- que el CONTEXT §4.2 pide: descubrimiento continuo, desatendido, con los
-- muertos saliendo solos.

-- ─────────────────────────────────────────────────────────────────────────────
-- COLA (spec §2.6)
--
-- En Postgres y NO en Redis: una dependencia menos, y `SKIP LOCKED` alcanza
-- sobradamente para este volumen. El spec lo dice explícito.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disc_jobs (
    id            BIGSERIAL PRIMARY KEY,
    -- 'discover' (una semilla × país) | 'audit' (un anunciante × país).
    -- `analyze` y `rank` NO son jobs: corren sobre el backlog global de
    -- `disc_ads` y encolarlos por unidad sería inventarles una clave que no
    -- tienen.
    kind          TEXT NOT NULL,
    payload       JSONB NOT NULL,
    priority      SMALLINT NOT NULL DEFAULT 5,   -- menor = antes
    status        TEXT NOT NULL DEFAULT 'pending',
    attempts      SMALLINT NOT NULL DEFAULT 0,
    max_attempts  SMALLINT NOT NULL DEFAULT 3,
    run_after     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at     TIMESTAMPTZ,
    locked_by     TEXT,
    last_error    TEXT,
    -- Evita encolar dos veces el mismo trabajo. Lleva la hora adentro
    -- (`audit:<page_id>:<país>:<YYYYMMDDHH>`) para que el recrawl de mañana no
    -- choque contra el de hoy.
    dedup_key     TEXT UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS disc_jobs_pending_idx
    ON disc_jobs (kind, priority, run_after) WHERE status = 'pending';

/*
 * Claim atómico (spec §2.6).
 *
 * ⚠️ TIENE QUE SER UNA FUNCIÓN SQL. PostgREST no sabe hacer
 * `FOR UPDATE SKIP LOCKED`, y sin eso dos workers se llevan el mismo job y se
 * paga dos veces la misma navegación contra Meta. `supabase-js` la invoca con
 * `.rpc('disc_claim_job', …)`.
 */
CREATE OR REPLACE FUNCTION disc_claim_job(p_kind TEXT, p_worker TEXT)
RETURNS SETOF disc_jobs
LANGUAGE sql
AS $$
    UPDATE disc_jobs SET
        status = 'running', locked_at = NOW(), locked_by = p_worker,
        attempts = attempts + 1
    WHERE id = (
        SELECT id FROM disc_jobs
        WHERE kind = p_kind AND status = 'pending' AND run_after <= NOW()
        ORDER BY priority, run_after
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING *;
$$;

/*
 * Reaper: un job `running` cuyo worker murió vuelve a la cola.
 *
 * Sin esto, matar el daemon a mitad de un job lo deja `running` para siempre y
 * esa semilla no se vuelve a mirar nunca — el modo de fallo silencioso de toda
 * cola. Un job que agotó `max_attempts` va a 'dead', no vuelve: reintentar
 * eternamente algo que falla siempre es cómo se quema una IP.
 */
CREATE OR REPLACE FUNCTION disc_reap_jobs(p_minutes INT DEFAULT 15)
RETURNS INT
LANGUAGE sql
AS $$
    WITH vencidos AS (
        UPDATE disc_jobs
        SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END,
            locked_at = NULL, locked_by = NULL,
            last_error = COALESCE(last_error, 'reaped: el worker no lo cerró')
        WHERE status = 'running'
          AND locked_at < NOW() - (p_minutes || ' minutes')::interval
        RETURNING 1
    )
    SELECT COALESCE(count(*), 0)::INT FROM vencidos;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VOCABULARIO Y BANDIT (spec §2.5 y §10)
--
-- El `term` acá es una SEMILLA del motor: `discover.ts` la expande con su
-- diccionario a ~23 queries. O sea el bandit decide qué NICHO mirar y en qué
-- país, no cada query suelta — que es la unidad en la que este motor cobra.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disc_keywords (
    term       TEXT PRIMARY KEY,
    term_norm  TEXT NOT NULL,
    -- 'seed' (diccionario curado o importado) | 'product_type' | 'tag' |
    -- 'product_name': de dónde salió. Los tres últimos los produce el
    -- vocabulario auto-alimentado del §10.
    source     TEXT NOT NULL,
    idf_score  NUMERIC(8,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS disc_keywords_active_idx ON disc_keywords (is_active, idf_score DESC);

CREATE TABLE IF NOT EXISTS disc_keyword_country_state (
    term            TEXT NOT NULL REFERENCES disc_keywords(term) ON DELETE CASCADE,
    country         CHAR(2) NOT NULL,
    last_run_at     TIMESTAMPTZ,
    runs            INT NOT NULL DEFAULT 0,
    total_results   INT NOT NULL DEFAULT 0,
    new_pages       INT NOT NULL DEFAULT 0,
    -- Anunciantes de esta combinación que pasaron la Regla 3 (monoproducto).
    qualified_pages INT NOT NULL DEFAULT 0,
    -- qualified_pages / total_results. Es lo que apaga las combinaciones
    -- estériles con datos en vez de con opinión.
    yield_rate      NUMERIC(6,4),
    PRIMARY KEY (term, country)
);

CREATE INDEX IF NOT EXISTS disc_kcs_pick_idx ON disc_keyword_country_state (last_run_at NULLS FIRST);

/*
 * Explotación del bandit (spec §10).
 *
 * Va en SQL y no en TypeScript porque ordena por `yield_rate × idf_score` sobre
 * un JOIN — PostgREST no sabe ordenar por una expresión de dos tablas, y traerlo
 * todo a memoria para ordenarlo en JS es leer el vocabulario entero en cada
 * ciclo.
 *
 * ⚠️ `COALESCE(yield_rate, 0.5)` NO es un default cosmético: una combinación que
 * nunca corrió tiene yield NULL, y con 0 nunca se elegiría — el bandit no
 * exploraría jamás por la rama de explotación. 0,5 la pone por encima de lo
 * medido-y-malo y por debajo de lo medido-y-bueno, que es exactamente el
 * optimismo ante la incertidumbre que un bandit necesita.
 */
CREATE OR REPLACE FUNCTION disc_bandit_exploit(p_limit INT, p_dias INT DEFAULT 7)
RETURNS TABLE (term TEXT, country CHAR(2))
LANGUAGE sql
AS $$
    SELECT kcs.term, kcs.country
    FROM disc_keyword_country_state kcs
    JOIN disc_keywords k ON k.term = kcs.term
    WHERE k.is_active
      AND (kcs.last_run_at IS NULL OR kcs.last_run_at < NOW() - (p_dias || ' days')::interval)
    ORDER BY (COALESCE(kcs.yield_rate, 0.5) * COALESCE(k.idf_score, 1.0)) DESC,
             kcs.last_run_at NULLS FIRST
    LIMIT p_limit;
$$;

/*
 * Exploración: combinaciones término×país que NUNCA se corrieron.
 *
 * Es la mitad que evita que el bandit se encierre en los nichos que ya conoce.
 * Con 649 semillas × 6 países hay ~3.900 combinaciones y la inmensa mayoría
 * nunca corrió, así que al principio esta rama es la que trabaja.
 */
CREATE OR REPLACE FUNCTION disc_bandit_explore(p_limit INT)
RETURNS TABLE (term TEXT, country CHAR(2))
LANGUAGE sql
AS $$
    SELECT k.term, c.country::CHAR(2)
    FROM disc_keywords k
    CROSS JOIN (VALUES ('MX'),('CO'),('CL'),('AR'),('EC'),('PE')) AS c(country)
    LEFT JOIN disc_keyword_country_state kcs
           ON kcs.term = k.term AND kcs.country = c.country
    WHERE k.is_active AND kcs.term IS NULL
    ORDER BY random()
    LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RECRAWL ADAPTATIVO (spec §9)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE disc_advertisers ADD COLUMN IF NOT EXISTS crawl_tier TEXT NOT NULL DEFAULT 'warm';
ALTER TABLE disc_advertisers ADD COLUMN IF NOT EXISTS consecutive_misses SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE disc_advertisers ADD COLUMN IF NOT EXISTS last_audited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS disc_advertisers_recrawl_idx
    ON disc_advertisers (crawl_tier, last_audited_at NULLS FIRST);

/*
 * Encolado de recrawls por tier (spec §9).
 *
 * ⚠️ EN SQL PORQUE ES UN `INSERT … SELECT` CON `ON CONFLICT DO NOTHING`, y esa
 * combinación es la que hace el encolado idempotente: correr el scheduler dos
 * veces en el mismo ciclo no duplica un solo job. Hacerlo en TypeScript sería
 * leer, comparar y escribir — con una carrera en el medio.
 *
 * `archived` queda fuera: sale del inventario activo pero conserva su histórico.
 * "Los viejos salen" es consecuencia de esto, no un job de limpieza aparte.
 */
CREATE OR REPLACE FUNCTION disc_enqueue_recrawls(p_limit INT DEFAULT 200)
RETURNS INT
LANGUAGE sql
AS $$
    WITH encolados AS (
        INSERT INTO disc_jobs (kind, payload, priority, dedup_key)
        SELECT 'audit',
               jsonb_build_object('page_id', a.page_id, 'country', COALESCE(a.country, 'CO')),
               CASE a.crawl_tier WHEN 'hot' THEN 1 WHEN 'warm' THEN 4 ELSE 7 END,
               'audit:' || a.page_id || ':' || COALESCE(a.country, 'CO') || ':' ||
               to_char(NOW(), 'YYYYMMDDHH24')
        FROM disc_advertisers a
        WHERE a.crawl_tier <> 'archived'
          AND (a.last_audited_at IS NULL
               OR a.last_audited_at < NOW() - (CASE a.crawl_tier
                    WHEN 'hot'        THEN interval '24 hours'
                    WHEN 'warm'       THEN interval '72 hours'
                    WHEN 'cold'       THEN interval '168 hours'
                    ELSE                   interval '336 hours' END))
          -- ⚠️ UN ANUNCIANTE QUE YA ESPERA EN LA COLA NO SE VUELVE A ENCOLAR.
          -- El `dedup_key` lleva la hora dentro para que el recrawl de mañana no
          -- choque con el de hoy, pero eso mismo permitía que uno todavía sin
          -- drenar se encolara otra vez a la hora siguiente: sigue vencido
          -- porque nadie lo miró aún. Medido en 2 h de daemon: 5 anunciantes se
          -- auditaron dos y hasta TRES veces (`…:2026082218` y `…:2026082220` y
          -- `…:2026082221` del mismo page_id), y cada repetición son 2
          -- navegaciones contra Meta tiradas — el recurso más escaso que tiene
          -- este motor.
          AND NOT EXISTS (
              SELECT 1 FROM disc_jobs j
              WHERE j.kind = 'audit'
                AND j.status IN ('pending', 'running')
                AND j.payload->>'page_id' = a.page_id
          )
        ORDER BY a.last_audited_at NULLS FIRST
        LIMIT p_limit
        ON CONFLICT (dedup_key) DO NOTHING
        RETURNING 1
    )
    SELECT COALESCE(count(*), 0)::INT FROM encolados;
$$;

-- Mismo blindaje que el resto: RLS on sin políticas → solo el service role.
ALTER TABLE disc_jobs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE disc_keywords               ENABLE ROW LEVEL SECURITY;
ALTER TABLE disc_keyword_country_state  ENABLE ROW LEVEL SECURITY;

/*
 * Recalcula `disc_keyword_country_state` DESDE LOS DATOS, en vez de acumularlo
 * a mano al cerrar cada corrida.
 *
 * ⚠️ ES DERIVADO Y NO ACUMULADO, a propósito. `qualified_pages` (los
 * anunciantes que pasaron la Regla 3) no se conoce al terminar el
 * descubrimiento: se sabe recién después de analizar landings y perfilar
 * catálogos, que ocurre horas más tarde. Un contador que se incrementa al
 * cerrar la corrida tendría que adivinarlo — o quedarse en cero para siempre,
 * que es peor porque el bandit lo leería como "este nicho no rinde".
 *
 * Derivarlo además hace la función idempotente: correrla dos veces da el mismo
 * estado, y un bug de conteo se arregla re-corriéndola en vez de con una
 * migración de datos.
 */
CREATE OR REPLACE FUNCTION disc_refresh_yield()
RETURNS INT
LANGUAGE sql
AS $$
    WITH por_combinacion AS (
        SELECT
            r.seed_query                          AS term,
            q.country::CHAR(2)                    AS country,
            count(DISTINCT r.id)                  AS runs,
            max(r.created_at)                     AS last_run_at,
            COALESCE(sum(q.ads_found), 0)::INT    AS total_results
        FROM disc_search_queries q
        JOIN disc_search_runs r ON r.id = q.run_id
        GROUP BY r.seed_query, q.country
    ),
    paginas AS (
        SELECT
            r.seed_query           AS term,
            d.country::CHAR(2)     AS country,
            a.page_id
        FROM disc_ad_discoveries d
        JOIN disc_search_queries q ON q.id = d.query_id
        JOIN disc_search_runs r    ON r.id = q.run_id
        JOIN disc_ads a            ON a.id = d.ad_id
        GROUP BY r.seed_query, d.country, a.page_id
    ),
    conteos AS (
        SELECT
            p.term,
            p.country,
            count(*)::INT AS new_pages,
            count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM disc_ranked rk WHERE rk.page_id = p.page_id
            ))::INT AS qualified_pages
        FROM paginas p
        GROUP BY p.term, p.country
    ),
    -- Solo se tocan las combinaciones cuyo término está en el vocabulario: una
    -- corrida manual sobre una semilla que nadie dio de alta no debe crear una
    -- fila huérfana con una FK rota.
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

-- ⚠️ EL RECRAWL SACABA A LOS MUERTOS DE `disc_advertisers` Y LA UI SEGUÍA
-- SIRVIÉNDOLOS. `disc_ranked` no tiene `crawl_tier` ni FK al anunciante, así que
-- un anunciante que el scheduler mandó a `archived` —dos pasadas sin un solo
-- anuncio activo— seguía apareciendo con sus números CONGELADOS y su sello
-- "Monoproducto 100%". Medido: se archivó a "Rodillera ActiveLife 2.0" y la
-- respuesta de la API no cambió ni una fila.
--
-- Es la cláusula que el §11 del spec ya tenía (`WHERE a.crawl_tier <> 'archived'`)
-- y que se había perdido al no poder usar su vista tal cual.
--
-- ⚠️ LEFT JOIN, NO INNER. Una fila rankeada cuyo anunciante todavía no está en
-- `disc_advertisers` (o que se borró al limpiar perfiles en ceros) es válida: el
-- INNER la haría desaparecer del catálogo sin que nadie lo pida. Solo se excluye
-- lo que está EXPLÍCITAMENTE archivado.
CREATE OR REPLACE VIEW disc_ranked_activo AS
SELECT r.*
FROM disc_ranked r
LEFT JOIN disc_advertisers a ON a.page_id = r.page_id
WHERE a.crawl_tier IS DISTINCT FROM 'archived';
