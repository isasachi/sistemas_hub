-- ⚠️ ESTO NO FUNCIONA. Se aplicó, se probó y la migración siguiente lo revierte.
-- Queda escrito para que nadie lo vuelva a intentar creyendo que es la salida.
--
-- La idea era darle margen propio al refresco: el tope de 8 s no es un
-- presupuesto para este paso, es una herencia — `service_role` lo hereda de
-- `authenticator`, donde está dimensionado para requests de API, mientras que
-- esto corre una vez cada 10 minutos desde un daemon.
--
-- Pero Postgres arma el temporizador de `statement_timeout` al INICIO de la
-- sentencia y no lo re-arma cuando el GUC cambia a mitad de camino, así que un
-- `SET` en la función no extiende el plazo de la llamada en curso.
ALTER FUNCTION disc_refresh_yield(INTERVAL, TEXT[])
    SET statement_timeout = '60s';
