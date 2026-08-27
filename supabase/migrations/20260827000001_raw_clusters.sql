-- ════════════════════════════════════════════════════════════════════════════
-- Un PRODUCTO detectado dentro de un anunciante.
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA MÁS EN ph_raw_products: la PK de esa tabla
-- es (niche, page_id) y de ella dependen scrape-raw.ts, refresh-active.ts y
-- remedir-rangos.ts. Meterle el cluster adentro obliga a tocar los tres, y
-- además los datos de ANUNCIANTE (nombre, país, total de anuncios) pertenecen
-- ahí de verdad: son el denominador con el que se estima cada cluster.
--
-- ph_raw_products se queda tal cual, como la fila del anunciante.
-- Para desmontar esto basta `drop table ph_raw_clusters`.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists ph_raw_clusters (
  niche         text    not null,
  page_id       text    not null,
  -- Clave de producto: host+path de la landing, o el título si el destino es un
  -- chat (ver el comentario de productKey sobre por qué el link de chat no
  -- identifica un producto). Estable entre corridas: por eso sirve de PK.
  cluster_key   text    not null,

  -- ⚠️ ad_count ACÁ ES ESTIMADO, no medido. Meta no expone cursor de paginación
  -- y solo se leen ~30 anuncios del anunciante, así que esto es
  -- (muestra_n / muestra_tot) * ad_count del anunciante. Los dos crudos quedan
  -- guardados al lado para poder auditar el estimado sin volver a scrapear.
  ad_count      integer not null,
  muestra_n     integer not null,
  muestra_tot   integer not null,

  titulo        text,
  cuerpo        text,                              -- copy del anuncio representativo
  url           text,
  name          text,                              -- del anunciante, para la card
  country       text,

  status        text    not null default 'pendiente',
  kind          text,
  product_name  text,
  verdict_note  text,
  senal_nicho   text,
  ad_start_date bigint,
  scraped_at    timestamptz not null default now(),
  verified_at   timestamptz,

  primary key (niche, page_id, cluster_key)
);

-- El serving por NICHO filtra por nicho + rango de anuncios y ordena por anuncios.
create index if not exists idx_ph_raw_clusters_bucket
  on ph_raw_clusters(niche, ad_count desc);

-- El serving por CATEGORÍA hace .in('niche', [...cientos]) sobre el mismo orden.
create index if not exists idx_ph_raw_clusters_ads
  on ph_raw_clusters(ad_count desc);

-- Mismo criterio que 20260730000001: RLS on sin políticas → solo service role.
alter table public.ph_raw_clusters enable row level security;
