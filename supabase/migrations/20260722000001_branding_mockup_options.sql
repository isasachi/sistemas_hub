-- Compose-first pipeline: variantes del mockup compuesto (master) para que el usuario elija una.
alter table branding_sessions add column if not exists mockup_options jsonb;
