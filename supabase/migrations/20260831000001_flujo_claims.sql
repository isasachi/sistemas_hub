-- Productos RECLAMADOS por un usuario (flujo de un producto por vez).
--
-- ⚠️ ES LO QUE HACE QUE EL FLUJO NO SEA TEATRO. Sin esta tabla el cupo vive en
-- el estado de React: recargar la página lo devuelve entero, y el producto que
-- alguien "tomó" se le sigue ofreciendo a todos los demás — o sea el problema
-- que el flujo existe para resolver (que varios usuarios terminen testeando lo
-- mismo) seguiría intacto.
--
-- ⚠️ SE OCULTA PARA TODOS, no solo para quien lo tomó: al abrirlo "se suma a tu
-- lista y deja de estar disponible para los demás". Por eso la PK es el
-- PRODUCTO y no (usuario, producto) — con la compuesta, dos usuarios distintos
-- pueden reclamar el mismo y la carrera queda abierta.
--
-- ⚠️ LA CLAVE ES EL `id` DE LA CARD (`RawProductEntry.id`), o sea
-- `nicho:page_id:cluster_key` sirviendo clusters y `nicho:page_id` sirviendo
-- anunciantes. Es TEXT sin foreign key a propósito: la PK de `ph_raw_clusters`
-- es compuesta de tres columnas, así que una FK obligaría a partir la clave en
-- tres y a re-escribirla si `TABLA_SERVING` cambia. Un producto borrado deja un
-- claim colgando, que es inofensivo: solo oculta algo que ya no existe.
create table if not exists ph_claims (
  entry_id    text primary key,
  -- Cuenta de Supabase. NO la cookie anónima de `readUserId`: el cupo cuelga del
  -- PLAN, y una identidad que se renueva borrando cookies daría cupo infinito.
  user_id     uuid not null,
  seed_query  text,
  taken_at    timestamptz not null default now(),

  -- La encuesta corta de la vuelta.
  ok_anuncios     boolean,
  ok_monoproducto boolean,

  -- true = el usuario gastó un CAMBIO. No cuenta contra su cupo de productos,
  -- sí contra el de cambios.
  --
  -- ⚠️ Y EL PRODUCTO SIGUE OCULTO. Devolverlo al catálogo sería pasarle a otro
  -- usuario justo lo que este acaba de reportar como malo.
  descartado  boolean not null default false
);

create index if not exists ph_claims_user_idx on ph_claims (user_id, taken_at desc);

-- Mismo criterio que el resto de las tablas ph_*: RLS on sin políticas, así que
-- solo el service role entra.
alter table public.ph_claims enable row level security;
