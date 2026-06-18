-- Prioridad de scrapeo por nicho. El daemon drena getNichesToRefresh() ordenado
-- por priority DESC, así que los nichos de mayor prioridad (partes del cuerpo,
-- sembrados con `# @priority N` en niches.txt) entran a los primeros bloques.
-- Default 0 = sin prioridad (comportamiento histórico).
alter table ph_niches add column if not exists priority int not null default 0;

-- Índice para el ORDER BY del drain (priority desc, last_scraped asc nulls first).
create index if not exists ph_niches_priority_idx
  on ph_niches (priority desc, last_scraped asc nulls first, id asc);
