-- Recableado del generador de video ads al PROMPT MAESTRO.
-- Una sola línea de entrada: el video original es obligatorio, así que `mode` deja
-- de existir. Los INPUTS del spec pasan a ser columnas explícitas porque el gate de
-- validación (FASE 0) necesita saber, campo por campo, si el usuario lo confirmó.

alter table video_sessions drop column if exists mode;
alter table video_sessions drop column if exists character_brief;

-- INPUTS DEL USUARIO (FASE 0 los clasifica como CONFIRMADA POR USUARIO)
alter table video_sessions add column if not exists angle text;              -- ÁNGULO DEL VIDEO
alter table video_sessions add column if not exists problem text;            -- PROBLEMA O DESEO PRINCIPAL
alter table video_sessions add column if not exists character_desc text;     -- PERSONAJE QUE APARECERÁ
alter table video_sessions add column if not exists character_ethnicity text;-- RAZA/ETNIA: SOLO del usuario
alter table video_sessions add column if not exists accent text;             -- ACENTO / VARIANTE DE HABLA
alter table video_sessions add column if not exists voice text;              -- VOZ DEL PERSONAJE
alter table video_sessions add column if not exists constraints text;        -- INFORMACIÓN ADICIONAL

-- FASE 0 / FASE 1 / FASE 2
alter table video_sessions add column if not exists validation jsonb;        -- ValidationMatrix
alter table video_sessions add column if not exists template jsonb;          -- ScriptTemplate (nueva forma)

comment on column video_sessions.character_ethnicity is
  'Solo lo escribe el usuario. El spec prohíbe inferir raza/etnia desde la apariencia.';
comment on column video_sessions.accent is
  'Solo lo escribe el usuario. Sin acento explícito la FASE 4.5 queda PENDIENTE.';
