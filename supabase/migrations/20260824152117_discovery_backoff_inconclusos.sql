-- ⚠️ UNA LECTURA INCONCLUSA NO SE SELLA, Y POR ESO EL ANUNCIANTE VOLVÍA PARA
-- SIEMPRE.
--
-- `audit.ts` sale con código 2 sin tocar `crawl_tier` ni `last_audited_at`
-- cuando Meta no da nodos. Ese guard es CORRECTO y no se toca: estampar
-- "auditado hoy, 0 anuncios" sobre un bloqueo manda a cuarentena a un
-- anunciante sano — es el fallo que dejó 19 perfiles en ceros.
--
-- Pero `disc_enqueue_recrawls` elige por `last_audited_at` vencido o NULL, así
-- que un anunciante que nunca se puede leer queda permanentemente vencido y
-- vuelve cada vez que se abre su ventana. Peor: el `ORDER BY ... NULLS FIRST`
-- lo pone AL FRENTE de la cola. Medido en un día: 4 anunciantes inconclusos, 2
-- de ellos repetidos (uno 3 veces), sobre ~200 ranuras de recrawl. Chico, pero
-- solo crece — cada anunciante que se vuelve ilegible se suma y no sale nunca.
--
-- `consecutive_misses` NO cubre esto: ese contador es para "se leyó bien y no
-- tenía anuncios", otra condición.
--
-- ⚠️ EL BACKOFF NO CONCLUYE NADA SOBRE EL ANUNCIANTE — solo deja de preguntar
-- tan seguido. No lo archiva ni lo manda a cuarentena, porque "no pude leerlo"
-- no es información sobre él sino sobre nuestra IP. El tope de 7 días hace que
-- se recupere solo en cuanto Meta deje de bloquear, y `guardarAuditoria` borra
-- la racha en cuanto una auditoría cierra bien.
--
-- ✅ Tabla de verdad verificada contra la base (mismo cálculo que el WHERE):
--   racha 1, hace 10 min  → se encola   (throttle transitorio, cadencia normal)
--   racha 2, hace 10 min  → se encola
--   racha 3, hace 2 h     → SE SALTA    (pide 2^3 = 8 h)
--   racha 3, hace 9 h     → se encola   (se recupera solo)
--   racha 5, hace 2 h     → SE SALTA    (pide 2^5 = 32 h)
--   racha 5, hace 40 h    → se encola
--   racha 10, hace 8 días → se encola   (tope de 7 días)
ALTER TABLE disc_advertisers
    ADD COLUMN IF NOT EXISTS inconclusive_streak  INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_inconclusive_at TIMESTAMPTZ;

COMMENT ON COLUMN disc_advertisers.inconclusive_streak IS
    'Lecturas inconclusas seguidas. Se resetea a 0 en cuanto una auditoría cierra bien.';

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
          -- Un anunciante que YA ESPERA EN LA COLA no se vuelve a encolar.
          AND NOT EXISTS (
              SELECT 1 FROM disc_jobs j
              WHERE j.kind = 'audit'
                AND j.status IN ('pending', 'running')
                AND j.payload->>'page_id' = a.page_id
          )
          -- Backoff exponencial de los que no se pueden leer. Las dos primeras
          -- veces se reintenta a cadencia normal (un throttle transitorio se
          -- resuelve solo); a partir de la tercera se espera 2^racha horas,
          -- topado en 7 días para que se recupere si Meta afloja.
          AND (a.inconclusive_streak < 3
               OR a.last_inconclusive_at IS NULL
               OR a.last_inconclusive_at < NOW() - LEAST(
                      interval '1 hour' * power(2, LEAST(a.inconclusive_streak, 10))::INT,
                      interval '7 days'))
        -- Los sanos primero: un NULL por "todavía no le tocó" vale más que un
        -- NULL por "nunca se pudo leer".
        ORDER BY a.inconclusive_streak, a.last_audited_at NULLS FIRST
        LIMIT p_limit
        ON CONFLICT (dedup_key) DO NOTHING
        RETURNING 1
    )
    SELECT COALESCE(count(*), 0)::INT FROM encolados;
$$;

CREATE INDEX IF NOT EXISTS disc_advertisers_recrawl_idx
    ON disc_advertisers (inconclusive_streak, last_audited_at NULLS FIRST)
    WHERE crawl_tier <> 'archived';
