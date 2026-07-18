-- Marca derivada del producto (Fase 3): nicho, paleta fusionada (packaging + familia del
-- nicho), par tipográfico del catálogo cerrado, casting del talento y mood de escena. Se
-- resuelve una vez por sesión (etapa 2→3), es editable por el usuario en el wizard y alimenta
-- tanto la composición Satori (tokens) como el prompt de escena (texto). Supera a
-- palette/typography (legado + canal del handoff de branding) cuando existe. Sin backfill.
alter table public.landing_sessions
  add column if not exists derived_brand jsonb;
