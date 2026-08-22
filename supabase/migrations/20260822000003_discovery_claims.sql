-- Productos RECLAMADOS por un usuario (flujo de un producto por vez).
--
-- ⚠️ ES LO QUE HACE QUE EL FLUJO NO SEA TEATRO. Sin esta tabla el cupo vive en
-- el estado de React: recargar la página lo devuelve entero, y el producto que
-- alguien "tomó" se le sigue ofreciendo a todos los demás — o sea el problema
-- que el rediseño existe para resolver (que varios usuarios terminen testeando
-- lo mismo) seguiría intacto.
--
-- ⚠️ SE OCULTA PARA TODOS, NO SOLO PARA QUIEN LO TOMÓ. Es la regla acordada: al
-- abrirlo "se suma a tu lista y deja de estar disponible para los demás". Por
-- eso el filtro vive en la vista de serving y no lleva `user_id` — un producto
-- reclamado desaparece del catálogo, punto.
CREATE TABLE IF NOT EXISTS disc_claims (
    -- ⚠️ LA CLAVE ES EL PRODUCTO, NO (usuario, producto). Un producto lo toma UNA
    -- persona: esa es toda la promesa del rediseño. Con la PK compuesta que
    -- tenía al principio, dos usuarios distintos podían reclamar el mismo — y el
    -- probe lo cazó en la primera corrida, con el comentario de `tomarProducto`
    -- jurando que la PK guardaba esa carrera. Ahora sí la guarda.
    dedupe_key  TEXT PRIMARY KEY REFERENCES disc_ranked(dedupe_key) ON DELETE CASCADE,
    -- Cuenta de Supabase. NO la cookie anónima: el cupo cuelga del PLAN, y una
    -- identidad que se renueva borrando cookies no es un límite.
    user_id     UUID NOT NULL,
    seed_query  TEXT,
    taken_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- La encuesta corta de la vuelta.
    ok_anuncios      BOOLEAN,
    ok_monoproducto  BOOLEAN,

    -- true = el usuario gastó un CAMBIO. No cuenta contra su cupo de productos,
    -- sí contra el de cambios.
    --
    -- ⚠️ Y EL PRODUCTO SIGUE OCULTO. Devolverlo al catálogo sería pasarle a otro
    -- usuario justo lo que este acaba de reportar como malo: le quemaría el cupo
    -- a alguien más con un producto ya descartado.
    descartado  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS disc_claims_user_idx ON disc_claims (user_id, taken_at DESC);

ALTER TABLE disc_claims ENABLE ROW LEVEL SECURITY;

-- El catálogo servible: sin anunciantes archivados y sin productos reclamados.
CREATE OR REPLACE VIEW disc_ranked_activo AS
SELECT r.*
FROM disc_ranked r
LEFT JOIN disc_advertisers a ON a.page_id = r.page_id
WHERE a.crawl_tier IS DISTINCT FROM 'archived'
  AND NOT EXISTS (SELECT 1 FROM disc_claims c WHERE c.dedupe_key = r.dedupe_key);
