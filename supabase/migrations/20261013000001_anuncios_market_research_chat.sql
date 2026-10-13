-- Generador de anuncios: dos columnas nuevas.
--
--  market_research  La investigación de mercado por keywords del nicho (`MarketResearchSchema`:
--                   niche, keywords, pains, desires). Reemplaza al paso de pegar comentarios de
--                   TikTok. La escribe `analyze-product` (corre en paralelo con el scan) y la lee
--                   solo el prompt de copy. NULL en sesiones anteriores: `generate-copy` la calcula.
--  messages         El historial del chat (`UIMessage[]` del AI SDK). El chat y el wizard comparten
--                   la MISMA fila, así que no hay tabla aparte. NULL si la sesión solo usó el wizard.
--
-- `tiktok_comments` NO se borra: dejó de leerse y de escribirse, y soltar una columna de una tabla
-- legada es una migración destructiva para ganar nada.
--
-- `sessions` es LEGADA: no se crea en ninguna migración de este repo, así que va con guard, igual
-- que 20260824000001_anuncios_what_it_is.sql.
--
-- ⚠️ APLICAR ANTES DE DESPLEGAR EL CÓDIGO: `analyze-product` escribe `market_research` en cada
-- análisis y PostgREST rechaza una columna que no existe.
do $$ begin
  if to_regclass('public.sessions') is not null then
    alter table public.sessions add column if not exists market_research jsonb;
    alter table public.sessions add column if not exists messages jsonb;
  end if;
end $$;
