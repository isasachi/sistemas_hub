-- Run in Supabase SQL Editor
-- WARNING: Drops existing sessions table. Backup data if needed.

DROP TABLE IF EXISTS sessions;

CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  step                INTEGER NOT NULL DEFAULT 0,
  reference_url       TEXT,
  reference_analysis  JSONB,
  product_url         TEXT,
  logo_url            TEXT,
  product_scan        JSONB,
  product_name        TEXT,
  what_it_does        TEXT,
  target_audience     TEXT,
  tiktok_comments     TEXT,
  copy_versions       JSONB,
  confirmed_copy      JSONB,
  edit_instruction    TEXT,
  image_url           TEXT
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON sessions FOR ALL USING (true) WITH CHECK (true);
