-- Fase 10 del motor de descubrimiento: la SALIDA, en una tabla que el front
-- pueda leer con un SELECT.
--
-- ⚠️ ES UNA TABLA Y NO LA VISTA MATERIALIZADA DEL §11 DEL SPEC. Esa vista une
-- `landings`/`ads`/`advertisers` por columnas que acá no existen
-- (`url_norm`, `crawl_tier`, `total_active_days`) y, sobre todo, **el score no
-- está en ninguna columna**: lo calcula `opportunityScore` en el ranking, que
-- corre en el worker. Una vista no puede reconstruirlo, así que el ranking lo
-- escribe.
--
-- ⚠️ LA UNIDAD ES (ANUNCIANTE, PRODUCTO), NO EL ANUNCIO. Es el §0 del spec y ya
-- está resuelto en `rank.ts`: un producto con cuatro anuncios es UNA fila. Servir
-- `disc_ads WHERE accepted` reintroduciría las cuatro.
CREATE TABLE IF NOT EXISTS disc_ranked (
    -- `${page_id}|${producto normalizado}`. Clave explícita en vez de
    -- UNIQUE(page_id, product_name): el nombre puede ser NULL y en Postgres dos
    -- NULL no colisionan, así que el mismo anunciante duplicaría fila en cada
    -- corrida.
    dedupe_key TEXT PRIMARY KEY,

    seed_query TEXT NOT NULL,
    run_id UUID REFERENCES disc_search_runs(id) ON DELETE SET NULL,

    page_id TEXT NOT NULL,
    advertiser TEXT,
    product_id UUID REFERENCES disc_products(id) ON DELETE SET NULL,
    product_name TEXT,
    -- Titular y cuerpo del MEJOR anuncio de la fila (el de score más alto), para
    -- que la card tenga algo que mostrar sin volver a `disc_ads`.
    headline TEXT,
    body TEXT,
    landing TEXT,

    -- Los países donde se descubrió, no uno solo: el mismo anunciante aparece en
    -- varios y quedarse con el primero borraba cobertura.
    countries TEXT[] NOT NULL DEFAULT '{}',
    -- `0_49` / `50_99` / `100_plus` — el vocabulario SIN AMBIGÜEDAD del motor
    -- nuevo. La traducción al de la UI vieja vive en el adaptador del front.
    bucket TEXT,
    advertiser_ads INT,
    product_ads INT,
    product_share NUMERIC,
    monoproduct BOOLEAN,
    days_active INT,
    relevance NUMERIC,
    score NUMERIC,
    -- Cuántos anuncios ACEPTADOS colapsaron en esta fila. No es `product_ads`
    -- (los del producto en todo el catálogo del anunciante).
    accepted_ads INT NOT NULL DEFAULT 1,

    ranked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- El serving ordena por score dentro de un rango, que es la única consulta que
-- hace la UI hoy.
CREATE INDEX IF NOT EXISTS disc_ranked_serving_idx ON disc_ranked(bucket, score DESC);
CREATE INDEX IF NOT EXISTS disc_ranked_seed_idx ON disc_ranked(seed_query);

ALTER TABLE disc_ranked ENABLE ROW LEVEL SECURITY;
