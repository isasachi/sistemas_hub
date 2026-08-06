-- Refresco de vigencia cada 48h (scripts/refresh-active.ts): cuándo se comprobó
-- por última vez que el anunciante sigue pautando. NULL = nunca → primero en la cola.
alter table ph_raw_products add column if not exists checked_at timestamptz;

create index if not exists idx_ph_raw_products_checked
  on ph_raw_products(checked_at nulls first)
  where status in ('monoproducto', 'inactivo');
