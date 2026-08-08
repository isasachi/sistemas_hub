-- Chips de sugerencia del buscador: los nichos con más inventario servible.
--
-- Va como RPC y no como query del cliente porque PostgREST no permite agregados
-- (`PGRST123`) y corta en 1000 filas — contar 28k desde el cliente exigiría
-- paginar 29 veces. El group by acá es un HashAggregate y punto.
create or replace function ph_raw_top_niches(p_limit int default 12)
returns table (niche text, productos bigint)
language sql
stable
as $$
  select p.niche, count(*)::bigint
  from ph_raw_products p
  where p.status <> 'inactivo'          -- mismo criterio que el serving
  group by p.niche
  order by count(*) desc, p.niche
  limit p_limit;
$$;
