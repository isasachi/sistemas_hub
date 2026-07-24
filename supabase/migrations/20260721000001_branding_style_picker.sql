-- Flujo por estilo del generador-branding (refactor 2026-07). Aditivo: no dropea nada.
alter table branding_sessions add column if not exists source_mode        text;
alter table branding_sessions add column if not exists style_id           text;
alter table branding_sessions add column if not exists product_type       text;
alter table branding_sessions add column if not exists descriptor         text;
alter table branding_sessions add column if not exists tagline            text;
alter table branding_sessions add column if not exists container_type     text;
alter table branding_sessions add column if not exists uploaded_image_url text;
alter table branding_sessions add column if not exists image_analysis     jsonb;
alter table branding_sessions add column if not exists selected_palette   jsonb;
alter table branding_sessions add column if not exists selected_typography jsonb;
