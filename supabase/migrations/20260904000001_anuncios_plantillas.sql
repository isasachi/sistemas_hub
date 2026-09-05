-- Generador de anuncios — flujo de PLANTILLA (el segundo flujo, junto al clásico).
--
-- `template_id` es el discriminador de los dos flujos: null = el clásico (el usuario sube su
-- propia referencia), no null = eligió una de las 8 plantillas curadas. NO se agrega una columna
-- `flow` porque se deriva de ésta, y dos fuentes de verdad para lo mismo se desincronizan.
--
-- `variants` guarda el lote: una fila por anuncio con su concepto, su copy por slot, su estado y
-- su URL. Es jsonb y no una tabla hija por el precedente vivo de `video_sessions.lotes`, que ya
-- demostró aguantar exactamente esta forma (estado por ítem, reanudable, escrito a medida que
-- cada ítem termina).
--
-- ⚠️ `sessions` es LEGADA: no se crea en ninguna migración de este repo, así que va con guard,
-- igual que 20260824000001_anuncios_what_it_is.sql.
--
-- Las dos nacen NULL y nadie las exige: toda sesión del flujo clásico —guardada o nueva— sigue
-- comportándose exactamente igual.
do $$ begin
  if to_regclass('public.sessions') is not null then
    alter table public.sessions add column if not exists template_id text;
    alter table public.sessions add column if not exists variants jsonb;
  end if;
end $$;
