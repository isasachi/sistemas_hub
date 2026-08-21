-- Fases 5-8 del spec: landing analyzer, product resolver, advertiser analyzer,
-- monoproducto.

-- Caché de landings (spec §35-36). La clave es la URL NORMALIZADA: medido sobre
-- la primera corrida real, 305 anuncios daban 253 landings y solo 39 dominios,
-- así que muchos anuncios comparten destino y sin caché se pagaría el mismo
-- fetch decenas de veces.
CREATE TABLE IF NOT EXISTS disc_landing_pages (
    url TEXT PRIMARY KEY,
    status_code INT,
    content_type TEXT,
    -- El HTML NO se guarda: son ~300 KB por página y no se vuelve a parsear
    -- desde la base. Lo que se conserva son las SEÑALES ya extraídas, que es lo
    -- que permite re-correr las reglas sin volver a pedir la página.
    signals JSONB,
    content_hash TEXT,
    error TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- El producto (spec §3).
CREATE TABLE IF NOT EXISTS disc_products (
    id UUID PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    canonical_name TEXT,
    normalized_name TEXT,
    product_type TEXT,
    brand TEXT,
    sku TEXT,
    price NUMERIC,
    currency TEXT,
    canonical_url TEXT,
    domain TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS disc_products_domain_idx ON disc_products(domain);

CREATE TABLE IF NOT EXISTS disc_ad_products (
    ad_id UUID NOT NULL REFERENCES disc_ads(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES disc_products(id) ON DELETE CASCADE,
    match_method TEXT NOT NULL,
    confidence NUMERIC NOT NULL,
    PRIMARY KEY (ad_id, product_id)
);

CREATE INDEX IF NOT EXISTS disc_ad_products_product_idx ON disc_ad_products(product_id);

-- El anunciante (spec §4). `bucket` usa los cortes SIN AMBIGÜEDAD del §29
-- (`0_49` / `50_99` / `100_plus`): con "0-50 / 50-100" no se sabe dónde cae 50.
-- El `raw-buckets.ts` del motor viejo NO se toca — cambiarlo movería el serving
-- del buscador que ya está en producción.
CREATE TABLE IF NOT EXISTS disc_advertisers (
    id UUID PRIMARY KEY,
    page_id TEXT NOT NULL UNIQUE,
    page_name TEXT,
    page_url TEXT,
    country TEXT,
    active_ads_count INT,
    bucket TEXT,
    sample_size INT,
    dominant_product_id UUID REFERENCES disc_products(id) ON DELETE SET NULL,
    product_share NUMERIC,
    monoproduct BOOLEAN,
    distinct_products INT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disc_advertiser_products (
    advertiser_id UUID NOT NULL REFERENCES disc_advertisers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES disc_products(id) ON DELETE CASCADE,
    ad_count INT NOT NULL DEFAULT 0,
    share NUMERIC,
    PRIMARY KEY (advertiser_id, product_id)
);

-- ⚠️ EL RECHAZO SE GUARDA, NO SE BORRA (spec §37-38). Sin esto no se puede
-- responder "1000 candidatos → 600 no-ecommerce → 200 no-físicos → 100 válidos",
-- que es justamente lo que permite mejorar las reglas SIN volver a scrapear.
-- `accepted` NULL = todavía no se evaluó.
ALTER TABLE disc_ads ADD COLUMN IF NOT EXISTS accepted BOOLEAN;
ALTER TABLE disc_ads ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE disc_ads ADD COLUMN IF NOT EXISTS physical_product BOOLEAN;
ALTER TABLE disc_ads ADD COLUMN IF NOT EXISTS ecommerce BOOLEAN;
ALTER TABLE disc_ads ADD COLUMN IF NOT EXISTS ecommerce_score INT;
ALTER TABLE disc_ads ADD COLUMN IF NOT EXISTS relevance NUMERIC;
ALTER TABLE disc_ads ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS disc_ads_accepted_idx ON disc_ads(accepted);

ALTER TABLE disc_landing_pages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE disc_products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE disc_ad_products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE disc_advertisers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE disc_advertiser_products ENABLE ROW LEVEL SECURITY;
