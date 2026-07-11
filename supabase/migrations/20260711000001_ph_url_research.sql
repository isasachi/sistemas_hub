-- Cola de "research por URL": el usuario pega una URL de Meta Ads Library y el
-- worker (poller dedicado) investiga ESE producto. Independiente de ph_products:
-- un producto pegado NO pasa por las reglas de oro (queremos su veredicto aunque
-- tenga <40 ads o esté saturado en PE). user_id es texto nullable como el resto
-- de tablas ph_* (UUID de auth o cookie anónima, sin FK).

CREATE TABLE IF NOT EXISTS ph_url_research (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text,
  url          text        NOT NULL,
  page_id      text,
  ad_id        text,
  status       text        NOT NULL DEFAULT 'pending',   -- pending|processing|ready|error|blocked
  result       jsonb,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- El poller toma la request pendiente más vieja (FIFO).
CREATE INDEX IF NOT EXISTS ph_url_research_pending
  ON ph_url_research (created_at)
  WHERE status = 'pending';

-- Igual que el resto de tablas ph_*: RLS on sin políticas → solo el service role
-- (API routes / worker) accede; la anon key queda bloqueada.
ALTER TABLE public.ph_url_research ENABLE ROW LEVEL SECURITY;
