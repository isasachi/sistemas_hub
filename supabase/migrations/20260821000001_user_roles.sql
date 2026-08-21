-- Roles del hub. DOS valores y nada más: 'admin' y 'operador'.
--
-- ⚠️ NO hay matriz de permisos, y es deliberado. Con un solo rol privilegiado, una
-- tabla de permisos es la interfaz-con-una-implementación que este repo ya evita en
-- otros lados: cuesta una tabla, un join y una pantalla, y responde exactamente la
-- misma pregunta que un `= 'admin'`. Cuando exista un TERCER rol que necesite una
-- rebanada distinta (soporte que lee pero no otorga acceso), ahí se convierte en
-- permisos — no antes.
--
-- Cuelga de `user_settings` por el mismo motivo que el perfil (20260820000002): ya es
-- una fila por usuario y partirla obligaría a dos lecturas para responder "¿es admin?".
--
-- ⚠️ El default NO alcanza: un usuario que nunca guardó nada NO TIENE FILA en esta
-- tabla, así que la ausencia también significa 'operador' y quien lea el rol tiene que
-- tratar el null como el valor por defecto (ver `getRole` en lib/roles.ts). Y el PRIMER
-- admin no puede salir de acá — nadie podría nombrarse a sí mismo: sale de la env
-- ADMIN_EMAILS, mismo patrón que WHOP_GRANDFATHERED_EMAILS.
alter table public.user_settings
  add column if not exists role text not null default 'operador';

-- Es la columna que decide quién puede regalar acceso y cambiar planes. Un typo que
-- la deje en 'admn' no debe poder escribirse; el check es más barato que el incidente.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_role_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_role_check check (role in ('admin', 'operador'));
  end if;
end $$;

-- Créditos de cortesía, sumados al límite del plan en el período en curso.
--
-- ⚠️ ES UN SUMANDO Y NO UN "RESET", a propósito. El saldo de créditos ES el conteo de
-- filas de `ph_gen_usage` (ver lib/credits.ts): "resetear" el período significaría
-- BORRAR esas filas, y son las mismas que alimentan el backstop global diario y la
-- única visibilidad que hay del costo real de Gemini/OpenAI. Un sumando compensa al
-- usuario sin destruir el dato de costo, y además permite regalar 20 en vez de solo
-- volver a cero.
--
-- Vale para el período en curso y para los siguientes: es un ajuste permanente hasta
-- que un admin lo vuelva a mover. Si alguna vez hace falta que caduque, el lugar es
-- una fila con fecha, no esta columna.
alter table public.user_settings
  add column if not exists credit_bonus integer not null default 0;
