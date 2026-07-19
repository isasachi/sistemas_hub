-- Avatares de testimonios (motor híbrido, las 8 secciones). La sección testimonios muestra 3
-- clientes DISTINTOS; sus retratos se generan una vez (Gemini) y se cachean acá para componerlos
-- como <img> sobre las tarjetas (Satori no puede generar caras, y una cara "detrás" del glass
-- saldría borrosa). jsonb array de URLs de Storage. Nullable → no rompe sesiones existentes.
alter table public.landing_sessions
  add column if not exists testimonial_avatars jsonb;
