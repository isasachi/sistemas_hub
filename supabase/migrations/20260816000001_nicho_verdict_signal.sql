-- ════════════════════════════════════════════════════════════════════════════
-- Pipeline scan-nicho: descubrimiento y medición deterministas + un único paso
-- Haiku para "¿es un producto físico DEL nicho?".
--
-- Reusa ph_raw_products a propósito: el front ya lee esa tabla, así que una fila
-- escrita por el pipeline nuevo aparece sin tocar el serving. Acá solo se
-- agregan las dos columnas que el pipeline nuevo produce y que no existían.
-- ════════════════════════════════════════════════════════════════════════════

alter table ph_raw_products
  -- Dónde apareció el término del nicho: path | titulo | cuerpo | ninguna.
  -- Es la señal de CONFIANZA del veredicto, no un filtro. Medido sobre acné:
  -- un término en la URL del producto es casi certeza, uno que solo está en el
  -- cuerpo del anuncio arrastra basura (un curso de idiomas y unas plantillas de
  -- pádel matchearon buscando en el copy).
  add column if not exists senal_nicho  text,
  -- Clave del producto dominante (dominio + path). Es la evidencia auditable
  -- del share: deja ver SOBRE QUÉ se calculó la mayoría.
  add column if not exists product_path text;

-- El serving ordena por ad_count dentro del nicho y ahora además descarta los
-- 'descartado'. Medido antes de aplicarlo: son 2.878 filas en 15 nichos y
-- ninguno queda por debajo de 82 productos, así que no vacía ninguna vitrina.
create index if not exists idx_ph_raw_products_servible
  on ph_raw_products(niche, ad_count desc)
  where status <> 'descartado' and status <> 'inactivo';
