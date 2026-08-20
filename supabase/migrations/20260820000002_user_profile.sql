-- Datos de la cuenta: perfil y facturación. Cuelgan de `user_settings`, la tabla
-- que ya existe por usuario (creada en 20260820000001 para la API key de KIE), en
-- vez de una tabla `profiles` nueva: es una fila por usuario en los dos casos y
-- partirla obligaría a dos lecturas para pintar una sola pantalla.
--
-- ⚠️ SOLO lo que pide un comprobante peruano: razón social o nombre, RUC/DNI y
-- dirección fiscal. No hay país, ni "empresa", ni campos agregados por simetría —
-- un campo que nadie llena y nadie lee es peor que uno ausente.
--
-- ⚠️ Y hoy NADIE los lee: el cobro lo hace Whop como merchant-of-record y el hub
-- no emite comprobantes (ver "pendiente de producto: SUNAT" en AGENTS.md). Se
-- guardan para cuando eso exista, y la pantalla se lo dice al usuario con esas
-- palabras en vez de dejarle creer que ya le van a facturar.
alter table public.user_settings
  add column if not exists full_name       text,
  add column if not exists phone           text,
  add column if not exists avatar_url      text,
  add column if not exists billing_name    text,
  add column if not exists tax_id          text,
  add column if not exists billing_address text;

-- NO hay tabla de pagos todavía, y es deliberado. El historial real exige capturar
-- `payment.succeeded` del webhook, o sea una SEGUNDA suposición sobre la forma del
-- sobre — la primera ya está documentada como no verificada. Si esa suposición
-- falla, la tabla queda vacía para siempre y la pantalla muestra "aún no hay pagos"
-- con toda naturalidad: éxito silencioso, el peor modo de fallo del proyecto.
-- Mientras tanto la pantalla muestra lo que SÍ es dato real y ya está en
-- `user_entitlements`: plan, estado de la membresía y fecha de renovación.
-- Se agrega después del smoke que confirme el payload, y ahí es una función.
