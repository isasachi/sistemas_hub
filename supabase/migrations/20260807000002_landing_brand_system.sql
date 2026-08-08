-- El sistema de diseño de la marca se COPIA desde la sesión de branding en el handoff (2026-08-07).
-- Copia y no lectura al vuelo: regenerar el board después mutaría en silencio el sistema de una
-- landing ya generada. Null = producto suelto → la extracción cae a visión + nicho.
alter table landing_sessions add column if not exists brand_system jsonb;
