-- MIGRATION.md — Deploy A (aditivo) + row-map (fase 9). NO dropea columnas (deploy B es aparte, días después).
alter table branding_sessions add column if not exists preset_version integer;
alter table branding_sessions add column if not exists generation_status text;
alter table branding_sessions add column if not exists generation_error text;

-- Fase 9.1: mapear style_id de los 12 viejos → 7 nuevos (evita crash de getPreset al abrir sesiones viejas).
update branding_sessions set style_id = case style_id
  when 'minimalista'          then 'editorial'
  when 'flat-geometrico'      then 'editorial'
  when 'lujo'                 then 'rich-not-snobby'
  when 'gold-foil-dorado'     then 'rich-not-snobby'
  when 'vintage-retro'        then 'neo-apotecario'
  when 'hand-drawn-artesanal' then 'neo-apotecario'
  when 'organico-eco'         then 'botanico'
  when 'japandi'              then 'botanico'
  when 'bold-maximalista'     then 'citrico-max'
  when 'colorido-y2k'         then 'future-nostalgia'
  when 'farmaceutico-clean'   then 'clinical-performance'
  when 'moderno-tech'         then 'clinical-performance'
  else style_id
end
where style_id in (
  'minimalista','flat-geometrico','lujo','gold-foil-dorado','vintage-retro',
  'hand-drawn-artesanal','organico-eco','japandi','bold-maximalista',
  'colorido-y2k','farmaceutico-clean','moderno-tech'
);
