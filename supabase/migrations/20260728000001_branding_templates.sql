-- Sistema de plantillas + ADN compositivo del generador-branding (2026-07).
-- Aditivo: no dropea nada. Las sesiones con source_mode='preset' quedan legadas
-- (se leen, no se continúan).
alter table branding_sessions add column if not exists template_id     text;
alter table branding_sessions add column if not exists palette_variant int default 0;
alter table branding_sessions add column if not exists palette_options jsonb;
