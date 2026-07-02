-- Estilo gráfico de marca para el handoff branding → landing: concept + personalidad
-- visual + logoDirection se concatenan y guían los devices/motivos que el modelo genera
-- en cada sección. Null en el flujo de producto suelto (la paleta/nicho bastan).
alter table public.landing_sessions
  add column if not exists brand_style text;
