-- Cuota diaria de búsquedas (máx 3/usuario/día, zona America/Lima) + bloqueo de
-- keyword repetida el mismo día. user_id es texto nullable, igual que ph_user_seen
-- (acepta UUID de auth o de cookie anónima, sin FK).

CREATE TABLE IF NOT EXISTS ph_user_searches (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL,
  keyword      text        NOT NULL,    -- input crudo del usuario (categoría)
  keyword_norm text        NOT NULL,    -- normalizado: trim+lower+sin acentos
  search_day   date        NOT NULL,    -- fecha en America/Lima, calculada en la app
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Conteo de cuota por usuario/día.
CREATE INDEX IF NOT EXISTS ph_user_searches_user_day
  ON ph_user_searches (user_id, search_day);

-- Bloqueo atómico de keyword repetida el mismo día (gana la carrera de inserts).
CREATE UNIQUE INDEX IF NOT EXISTS ph_user_searches_dup
  ON ph_user_searches (user_id, search_day, keyword_norm);
