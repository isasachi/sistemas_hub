-- Keyframes de cada lote, para el modo FIRST_AND_LAST_FRAMES_2_VIDEO de Veo 3.1.
--
-- Array de URLs: `frames[i]` es el fotograma de CIERRE del lote i, y el avatar abre el
-- primero. Se persisten porque el último fotograma de un clip es el primero del
-- siguiente: si al reanudar un render parcial se regeneraran, el clip nuevo empezaría en
-- una pose distinta de donde terminó el que ya se pagó, y la continuidad —que es todo el
-- punto de este modo— se rompería en silencio.
alter table video_sessions add column if not exists frames jsonb;
