-- Motor de descubrimiento (Fases 1-4 del spec): search_runs → search_queries →
-- ad_discoveries → ads.
--
-- ⚠️ Tablas PREFIJADAS `disc_`, no con los nombres pelados del spec. En esta
-- base ya viven las `ph_*` del buscador viejo y una tabla llamada `ads` a secas
-- es un nombre que cualquier otra cosa va a querer mañana. El prefijo mantiene
-- los dos motores separados: este pipeline no lee ni escribe una sola fila de
-- `ph_*`, así que se puede comparar con el viejo sobre datos reales antes de
-- jubilar ninguno.

-- Una corrida = una consulta semilla del usuario.
CREATE TABLE IF NOT EXISTS disc_search_runs (
    id UUID PRIMARY KEY,
    seed_query TEXT NOT NULL,
    countries TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- Cada (query expandida × país) de la matriz de búsqueda.
CREATE TABLE IF NOT EXISTS disc_search_queries (
    id UUID PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES disc_search_runs(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    country TEXT NOT NULL,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    ads_found INT NOT NULL DEFAULT 0,
    pages_read INT NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, query, country)
);

CREATE INDEX IF NOT EXISTS disc_search_queries_run_idx ON disc_search_queries(run_id, status);

-- El anuncio crudo. Una fila por anuncio, sin importar por cuántas búsquedas
-- haya aparecido (eso vive en disc_ad_discoveries).
CREATE TABLE IF NOT EXISTS disc_ads (
    id UUID PRIMARY KEY,
    dedupe_key TEXT NOT NULL UNIQUE,
    ad_archive_id TEXT UNIQUE,

    page_id TEXT NOT NULL,
    page_name TEXT,
    page_url TEXT,
    page_categories TEXT[],

    landing_url TEXT,
    landing_domain TEXT,

    primary_text TEXT,
    headline TEXT,
    caption TEXT,
    cta TEXT,

    start_date TIMESTAMPTZ,
    collation_count INT,

    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_data JSONB
);

CREATE INDEX IF NOT EXISTS disc_ads_page_idx ON disc_ads(page_id);
CREATE INDEX IF NOT EXISTS disc_ads_domain_idx ON disc_ads(landing_domain);

-- POR QUÉ encontramos el anuncio. Tres queries que devuelven el mismo anuncio
-- son 1 anuncio y 3 caminos de descubrimiento (spec §2), no 3 anuncios: por eso
-- es una tabla y no un contador `vistas` en disc_ads.
CREATE TABLE IF NOT EXISTS disc_ad_discoveries (
    ad_id UUID NOT NULL REFERENCES disc_ads(id) ON DELETE CASCADE,
    query_id UUID NOT NULL REFERENCES disc_search_queries(id) ON DELETE CASCADE,
    country TEXT NOT NULL,
    position INT,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ad_id, query_id, country)
);

CREATE INDEX IF NOT EXISTS disc_ad_discoveries_query_idx ON disc_ad_discoveries(query_id);

-- Mismo blindaje que el resto del proyecto: RLS on sin políticas → solo el
-- service role toca estas tablas.
ALTER TABLE disc_search_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE disc_search_queries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE disc_ads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE disc_ad_discoveries   ENABLE ROW LEVEL SECURITY;
