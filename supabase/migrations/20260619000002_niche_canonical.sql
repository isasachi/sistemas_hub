-- Dedup de nichos: agrupa hermanos semánticos bajo un nicho canónico. Cuando un
-- nicho nuevo entra y el gate Haiku del worker lo juzga el MISMO mercado que uno
-- existente (ej. "calvicie" → "alopecia", "dolor de rodilla" → "rodilla"),
-- canonical_id apunta al canónico y el nicho NO se scrapea ni se sirve solo:
-- el route `search` resuelve canonical_id y muestra el pool del canónico.
-- null = el nicho ES canónico (raíz). canonical_id siempre apunta a una raíz
-- (un nicho con canonical_id null) → la resolución en serving no encadena.
alter table ph_niches add column if not exists canonical_id text null
  references ph_niches(id) on delete set null;

-- getNichesToRefresh filtra canonical_id IS NULL → un alias nunca re-entra a la
-- cola de scrapeo (estado terminal). Índice parcial para ese filtro del drain.
create index if not exists ph_niches_canonical_idx
  on ph_niches (canonical_id) where canonical_id is not null;
