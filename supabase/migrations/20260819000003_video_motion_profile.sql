-- FASE 4.6 — el tercer artefacto bloqueado del personaje.
--
-- `consistency_block` congela cómo se VE y `voice_profile` cómo SUENA; no había nada
-- para cómo se MUEVE. `accionVisual` describe solo movimientos con propósito narrativo,
-- y un cuerpo que solo hace movimientos con propósito es exactamente lo que se reportó
-- como "robótico". Guarda dos campos separados a propósito (`calidadMovimiento` y
-- `manerismos`): la fluidez y la energía son ejes independientes y colapsarlos hace que
-- un original sereno se describa como "energía baja" en vez de "movimiento continuo".
alter table video_sessions add column if not exists motion_profile jsonb;
