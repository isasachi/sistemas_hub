-- Rate-limit de generaciones Gemini (la llamada cara). Sin esto las rutas
-- app/api/**/*generate*/route.ts eran world-callable sin tope → gasto LLM ilimitado.
-- Dos topes diarios (zona America/Lima, calculada en la app):
--   GLOBAL  = backstop de costo (un atacante que limpia cookies no lo evade).
--   POR-USER = fairness por navegador (cookie ph_uid) / usuario auth.
-- user_id text nullable, igual que ph_user_searches/ph_user_seen (UUID auth o cookie).

CREATE TABLE IF NOT EXISTS ph_gen_usage (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text,                    -- null si aún no hay cookie
  kind       text        NOT NULL,    -- 'branding-logo' | 'anuncios-image' | ...
  gen_day    date        NOT NULL,    -- fecha America/Lima, calculada en la app
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Conteo del tope global por día.
CREATE INDEX IF NOT EXISTS ph_gen_usage_day      ON ph_gen_usage (gen_day);
-- Conteo del tope por usuario/día.
CREATE INDEX IF NOT EXISTS ph_gen_usage_user_day ON ph_gen_usage (user_id, gen_day);

-- Igual que el resto de tablas: RLS on, sin políticas → solo service role (las API routes).
ALTER TABLE ph_gen_usage ENABLE ROW LEVEL SECURITY;
