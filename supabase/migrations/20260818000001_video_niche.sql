-- Nicho del video ad. Decide qué prompt se usa y, sobre todo, si el PRODUCTO es un
-- objeto que el personaje sostiene (suplementos) o algo que LLEVA PUESTO (ropa,
-- zapatos) — en ese caso el producto y el vestuario son el mismo objeto y hoy son dos
-- campos que se contradicen dentro del mismo prompt de lote.
--
-- Default 'suplementos': toda sesión existente tiene que seguir comportándose igual.
alter table video_sessions
  add column if not exists niche text not null default 'suplementos';
