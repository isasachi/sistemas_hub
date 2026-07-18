-- Copy estructurado de la sección Oferta del motor híbrido (Fase 1): tiers, precio ancla,
-- costo por unidad, urgencia y el tier destacado (decoy). Distinto de `copy` (SectionCopy[]
-- del motor viejo): acá Satori compone el texto, así que la estructura es rica y editable.
-- Se genera con OfferCopySchema y se re-compone a $0 al cambiar un precio. Null = sesión que
-- todavía no generó la oferta híbrida (motor viejo intacto).
alter table public.landing_sessions
  add column if not exists offer_copy jsonb;
