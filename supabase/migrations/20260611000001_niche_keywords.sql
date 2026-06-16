-- ════════════════════════════════════════════════════════════════════════════
-- Buscador de Productos — expansión de keywords por nicho
-- keywords: set expandido (≥15) generado una vez por nicho (LLM en CI) y cacheado.
-- expanded: true cuando el nicho ya pasó por la segunda pasada US/ES (garantía
--           de output) — evita re-expandir en cada corrida del cron.
-- ════════════════════════════════════════════════════════════════════════════

alter table ph_niches add column if not exists keywords jsonb;
alter table ph_niches add column if not exists expanded boolean not null default false;
