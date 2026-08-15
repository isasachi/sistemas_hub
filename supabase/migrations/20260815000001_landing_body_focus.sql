-- Zona del cuerpo sobre la que actúa el producto (2026-08-15).
--
-- POR QUÉ: las poses del talento se elegían SOLO por demografía, y todos los bancos están
-- encuadrados en el rostro. Una `female_18_30` recibía "mano en la mejilla" tanto para un sérum de
-- acné como para una creatina de glúteos, y una rodillera salía con un retrato en vez de una
-- rodilla. La zona no se deriva del nicho ni de la demografía (creatina para masa y creatina para
-- glúteos son el mismo nicho, la misma demografía y distinta zona): sale del producto + el ángulo.
--
-- Ambas columnas son NULL-ables y sin default: null = sesión anterior a esta fecha, y el código la
-- resuelve como `rostro` en el sitio de uso, que es el comportamiento histórico.
alter table landing_sessions add column if not exists body_focus text;

-- Segunda placa de talento, encuadrada en la zona y SIN rostro. La usan las secciones con
-- protagonista MENOS el hero (el hero muestra la cara: es lo que construye confianza al abrir).
-- Se genera junto a la canónica y solo cuando la zona no es rostro/cabello.
alter table landing_sessions add column if not exists talent_zone_url text;
