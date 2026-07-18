-- Placa canónica del talento (Fase 4): retrato del beneficiario derivado UNA vez por sesión
-- desde el CastingSpec, sobre fondo neutro. Se pasa como referencia a todas las secciones
-- para que la persona no cambie entre ellas. Null si el producto no lleva persona.
alter table public.landing_sessions
  add column if not exists talent_canonical_url text;
