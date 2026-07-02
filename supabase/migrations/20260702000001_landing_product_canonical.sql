-- Placa canónica del producto: extracción quirúrgica del producto (aislado de los
-- elementos que lo rodean en la referencia, con todos sus labels) derivada UNA vez por
-- sesión y cacheada aquí. Se usa como ancla idéntica en todas las secciones para que el
-- producto —y sobre todo su label— no derive entre secciones. Null hasta que la primera
-- sección la deriva (o si la extracción falla → se cae a las fotos crudas).
alter table public.landing_sessions
  add column if not exists product_canonical_url text;
