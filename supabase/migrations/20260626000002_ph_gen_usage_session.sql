-- Contador de regeneraciones por step de una sesión (tool). El step es `kind`,
-- la instancia de tool es `session_id`. Reusa la tabla del backstop diario.
ALTER TABLE ph_gen_usage ADD COLUMN IF NOT EXISTS session_id text;
CREATE INDEX IF NOT EXISTS ph_gen_usage_session_kind
  ON ph_gen_usage (session_id, kind);
