-- Varios personajes por anuncio (hasta 4).
--
-- Aditivo a propósito: las columnas singulares (`character_url`, `avatar_url`, `accent`,
-- `character_ethnicity`, `consistency_block`, `voice_profile`, `motion_profile`) se
-- quedan como camino legado, y `personajesDe` (lib/video-ads/personajes.ts) devuelve UN
-- personaje armado desde ellas cuando esta columna está en null. Así ninguna sesión
-- anterior necesita migrarse ni re-analizarse — el análisis forense es el paso caro.
alter table video_sessions add column if not exists personajes jsonb;
