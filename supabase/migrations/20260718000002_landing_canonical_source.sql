-- Origen de la placa canónica del producto (Fase 2): 'photo' = derivada de la foto real
-- en la etapa 2 (nuevo, sin degradación generacional) · 'render' (legado) = recortada del
-- render de la primera sección. Sesiones viejas quedan null → se tratan como 'render'.
alter table public.landing_sessions
  add column if not exists product_canonical_source text;
