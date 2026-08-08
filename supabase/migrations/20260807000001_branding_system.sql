-- Sistema de diseño de la marca (decisión 2026-08-07): el branding pasa a ser la fuente del sistema de diseño de
-- la landing. Se extrae UNA vez del board de identidad y viaja al handoff branding → landing.
alter table branding_sessions add column if not exists brand_system jsonb;
