-- Fuera los datos de facturación. Los comprobantes los emite Whop como
-- merchant-of-record, así que el hub no tiene por qué pedir RUC ni dirección
-- fiscal: eran datos que nadie iba a leer, y la propia pantalla tenía que
-- explicarle al usuario que no se usaban todavía. Decisión del dueño del repo
-- (2026-08-20): los pagos se hacen solo por Whop.
--
-- Se DROPEAN en vez de dejarse muertas porque están verificadamente vacías
-- (`user_settings` tenía 0 filas al aplicar esto) y porque una columna que nadie
-- lee es exactamente la clase de resto que después confunde — el precedente es
-- `testimonial_avatars`, que sigue en la base sin que nada la toque.
alter table public.user_settings
  drop column if exists billing_name,
  drop column if exists tax_id,
  drop column if exists billing_address;
