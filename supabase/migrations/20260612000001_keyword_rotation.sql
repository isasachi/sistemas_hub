-- ════════════════════════════════════════════════════════════════════════════
-- Plan 13 parte C: rotación de keywords por cron.
-- Cada corrida del cron usa una ventana distinta del pool de keywords del nicho
-- (avanzando este cursor) para descubrir anunciantes NUEVOS sin corridas gigantes.
-- El seed/re-scrape manual ignora la rotación (usa todas las keywords).
-- ════════════════════════════════════════════════════════════════════════════

alter table ph_niches add column if not exists keyword_cursor int not null default 0;
