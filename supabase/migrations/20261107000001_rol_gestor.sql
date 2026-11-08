-- Rol 'gestor': debajo de 'admin'. Entra al panel de usuarios y hace todo lo que hace
-- un admin (cortesías de acceso y de créditos) MENOS cambiar roles. Esa regla vive en
-- el código (`puedeCambiarRoles`, apps/web/lib/roles.ts); acá solo se amplía el check.
--
-- Solo AMPLÍA el conjunto de valores válidos: ninguna fila existente cambia, y el
-- código anterior (que no conoce 'gestor') lo lee como 'operador' vía `toRole`, así que
-- aplicarla antes del deploy es seguro.
alter table public.user_settings
  drop constraint if exists user_settings_role_check;

alter table public.user_settings
  add constraint user_settings_role_check check (role in ('admin', 'gestor', 'operador'));
