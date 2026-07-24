-- Contrato spec 2026-07-23: clasificación + ADN visual del generador-landing.
alter table landing_sessions add column if not exists niche_id text;
alter table landing_sessions add column if not exists demographic_id text;
alter table landing_sessions add column if not exists landing_dna jsonb;
