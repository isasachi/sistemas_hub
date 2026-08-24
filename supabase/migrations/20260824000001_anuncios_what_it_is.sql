-- Generador de anuncios: cuarta pregunta del brief, "¿Qué es?" (la categoría/formato del
-- producto), separada de "¿Qué hace?". Es el dato con el que se rellenan los huecos de la
-- plantilla del tipo `[tipo de producto]`: sin él el modelo responde con la categoría genérica
-- que dedujo del envase, que es el fallo ya medido en la FASE 3 de video-ads.
--
-- `sessions` (generador-anuncios) es LEGADA: no se crea en ninguna migración de este repo, así
-- que va con guard, igual que 20260708000001_session_history.sql.
--
-- La columna nace NULL y NADIE la exige en el servidor: agregarla al 409 de generate-copy
-- rompería toda sesión guardada a medio hacer. Obligatoria solo en el formulario.
do $$ begin
  if to_regclass('public.sessions') is not null then
    alter table public.sessions add column if not exists what_it_is text;
  end if;
end $$;
