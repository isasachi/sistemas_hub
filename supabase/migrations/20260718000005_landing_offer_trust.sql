-- Fase 5 (ADN de oferta y confianza como contrato). Oferta y bloque de confianza suben a nivel
-- de sesión: los tiers de precio (con decoy) y los hechos operativos del negocio (contraentrega,
-- plazos, medios de pago, garantía) dejan de ser copy por sección y pasan a ser datos compartidos,
-- para que ninguna sección contradiga a otra. `trust_block` lo llena el usuario en el wizard, no
-- el LLM. Nullable → no rompe sesiones existentes (resolveOffer recupera los tiers legados de
-- offer_copy mientras `offer` siga null).
alter table public.landing_sessions
  add column if not exists offer jsonb,
  add column if not exists trust_block jsonb;
