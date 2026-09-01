-- Una línea que dice qué es el producto, para la card del buscador.
--
-- ⚠️ POR QUÉ NO ALCANZA `cuerpo`: ese campo es el copy del anuncio tal cual —
-- promoción, emojis, "PIDE Y PAGA AL RECIBIR"— y en el 10% de las filas está
-- vacío. Esto es la descripción REDACTADA por el veredicto, en la misma llamada
-- que ya decide el nombre y la pertenencia al nicho: no cuesta una llamada más.
--
-- Nace NULL en todas las filas: la card cae a `cuerpo` mientras no exista, que
-- es exactamente lo que hace hoy.
alter table ph_raw_clusters add column if not exists descripcion text;
