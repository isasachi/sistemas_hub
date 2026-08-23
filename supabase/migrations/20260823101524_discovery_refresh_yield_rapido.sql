-- Índices para `disc_refresh_yield()`. La función final vive en la migración
-- siguiente, que la reemplaza entera.
--
-- ⚠️ `disc_ranked.page_id` no tenía índice, y la función preguntaba por él con
-- un `EXISTS` correlacionado POR GRUPO (término × país × página). Con 77.643
-- descubrimientos eso excedió el `statement_timeout` y el scheduler murió con
-- código 1 — y no falla solo ese paso: el refresco corre ANTES de encolar, así
-- que el motor deja de repartir trabajo hasta que alguien lo mire.
CREATE INDEX IF NOT EXISTS disc_ranked_page_idx ON disc_ranked (page_id);
CREATE INDEX IF NOT EXISTS disc_ad_discoveries_ad_idx ON disc_ad_discoveries (ad_id);
