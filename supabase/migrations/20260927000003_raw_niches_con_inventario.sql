-- La lista de nichos con inventario para el serving por categoría
-- (`getNichesWithInventory`). Antes salía de `ph_raw_top_niches(2000)`, que es
-- un GROUP BY + count(*) sobre TODA `ph_raw_products` (~190k filas) para
-- ordenar por conteo — y el buscador solo necesita la LISTA. Medido 2026-09-27
-- en prod: 68k buffers, 4,8 s con todo en caché, y 2 de 7 llamadas reales con
-- `57014` (la caché de `nichos-inventario.ts` no alcanza con tráfico bajo: las
-- búsquedas llegan separadas por horas, a instancias frías).
--
-- Loose index scan: el CTE recursivo salta de nicho en nicho por el índice
-- (674 sondas) y `exists` pide UNA fila no inactiva por nicho. Mismo resultado
-- que el RPC viejo (674 nichos, 0 diferencias) con 4.958 buffers, 1,1 s en frío.
--
-- Devuelve UN arreglo, no un setof: PostgREST corta a `max_rows` (1000) también
-- en los RPC, y un setof tendría ese techo en silencio.
--
-- `ph_raw_top_niches` sigue: los chips de la portada (`getTopNiches(12)`) sí
-- necesitan el conteo.
create or replace function public.ph_raw_niches_con_inventario()
returns text[]
language sql
stable
as $$
  with recursive n as (
    (select niche from ph_raw_products order by niche limit 1)
    union all
    select (select p.niche from ph_raw_products p
             where p.niche > n.niche order by p.niche limit 1)
      from n where n.niche is not null
  )
  select coalesce(array_agg(n.niche order by n.niche), '{}')
    from n
   where n.niche is not null
     and exists (select 1 from ph_raw_products p
                  where p.niche = n.niche and p.status <> 'inactivo');
$$;
