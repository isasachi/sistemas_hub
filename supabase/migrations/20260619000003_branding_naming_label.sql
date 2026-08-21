-- Generador de Branding — revisión de naming + etiqueta.
-- Separa el nombre del producto del de la marca, y guarda datos estructurados de
-- la etiqueta (formato del empaque, ingredientes, peso, unidades) + una etiqueta
-- de referencia subida por el usuario.

alter table branding_sessions
  add column if not exists product_name        text,
  add column if not exists label_data          jsonb,   -- { packagingFormat, ingredients, netWeight, units, highlight }
  add column if not exists label_reference_url text;
