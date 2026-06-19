-- Generador de Branding — referencias como inspiración, no copia literal.
-- El usuario subía una etiqueta de referencia y el modelo la copiaba literal
-- (un ref de chocolate volvía su producto de chocolate). Ahora la referencia se
-- analiza UNA vez al subirla → se extraen solo patrones estructurales (composición,
-- jerarquía, espaciado, acabado) como texto; la generación usa ese texto y NO la
-- imagen cruda. Además se admite referencia de logo (no solo de etiqueta).

alter table branding_sessions
  add column if not exists logo_reference_url       text,
  add column if not exists logo_reference_analysis  text,
  add column if not exists label_reference_analysis text;
