-- Fase 6 (paralelización): upsert ATÓMICO de una sección dentro del array jsonb `sections`.
-- El cliente genera las 8 secciones en paralelo (concurrencia 3); cada request de sección hacía
-- read-modify-write del array COMPLETO (getLandingSession → update {sections}) → con requests
-- concurrentes sobre la MISMA sesión se pierden updates (last-writer-wins). Esta función serializa
-- los escritores de la misma fila con FOR UPDATE y reconstruye el array reemplazando por `type`,
-- así las N secciones concurrentes persisten todas. Idempotente (create or replace).
create or replace function landing_upsert_section(p_id uuid, p_section jsonb)
returns void
language plpgsql
as $$
declare
  cur jsonb;
begin
  -- Lock de fila: el 2º escritor espera al commit del 1º y recién ahí lee `cur` (ya con su cambio).
  select sections into cur from landing_sessions where id = p_id for update;
  cur := coalesce(cur, '[]'::jsonb);
  cur := (
    select coalesce(jsonb_agg(e order by (e->>'order')::int), '[]'::jsonb)
    from (
      select e
      from jsonb_array_elements(cur) e
      where e->>'type' is distinct from p_section->>'type'
      union all
      select p_section
    ) t(e)
  );
  update landing_sessions set sections = cur, step = greatest(step, 5) where id = p_id;
end
$$;
