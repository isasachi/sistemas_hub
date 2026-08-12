-- FASE 3 (adaptación), FASE 4 (personaje), FASE 4.5 (voz) y FASE 5 (lotes).
--
-- `lotes` es un array porque el spec parte el video en tramos de ≤15 s y cada uno es
-- una tarea de KIE independiente, con su propio taskId, estado y URL. El entregable
-- son N clips: no hay ffmpeg en apps/web para unirlos, y unirlos tampoco es lo que
-- pide el spec (cada lote es autónomo por diseño).

alter table video_sessions add column if not exists adapted jsonb;            -- AdaptedScript
alter table video_sessions add column if not exists character_prompt text;    -- FASE 4
alter table video_sessions add column if not exists consistency_block text;   -- FASE 4: identidad bloqueada
alter table video_sessions add column if not exists voice_profile jsonb;      -- FASE 4.5
alter table video_sessions add column if not exists lotes jsonb;              -- Lote[]

-- Columnas huérfanas: el render pasa a ser por lote, y el PLAN A ya reemplazó el
-- guión por `template` + `adapted` sin dropear las viejas. Dejar `script_template`
-- conviviendo con `template` (y `confirmed_script` con `adapted`) son dos pares de
-- columnas plausibles sin ninguna marcada como canónica — el próximo que lea el
-- schema no sabe cuál es la viva.
alter table video_sessions drop column if exists script_versions;
alter table video_sessions drop column if exists direction;
alter table video_sessions drop column if exists video_prompt;
alter table video_sessions drop column if exists kie_task_id;
alter table video_sessions drop column if exists video_status;
alter table video_sessions drop column if exists script_template;   -- la reemplazó `template` (PLAN A)
alter table video_sessions drop column if exists confirmed_script;  -- la reemplaza `adapted`

comment on column video_sessions.consistency_block is
  'Identidad visual bloqueada. Se repite ÍNTEGRAMENTE en cada lote: el generador no recuerda lotes anteriores.';
