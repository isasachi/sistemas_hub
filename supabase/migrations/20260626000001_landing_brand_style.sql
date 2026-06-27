-- Generador de Landing — paleta + tipografía de marca por sesión.
-- Predominan sobre la plantilla (que aporta estructura) en la generación de imagen.
-- Origen: handoff desde branding (direction.palette/typography) o derivadas de la
-- foto del producto (style-extract) en una sesión fresca.

alter table public.landing_sessions
  add column if not exists palette jsonb,       -- [{ name, hex, usage? }]
  add column if not exists typography jsonb;     -- { headline, body }
