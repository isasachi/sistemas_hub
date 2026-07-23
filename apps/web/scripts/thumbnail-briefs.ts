/**
 * thumbnailBriefs.ts
 * ---------------------------------------------------------------------------
 * Un BrandBrief por cada uno de los 7 estilos de STYLE_PRESETS (migración fase
 * 1, jul 2026 — reemplaza los 12 briefs de la v1), usado por
 * `gen-thumbnails-v2.ts` para generar el thumbnail (mockup compuesto) del
 * picker del generador de marca.
 *
 * Cada brief está GROUNDED en una categoría de producto real (investigada vía
 * WebSearch: convenciones de naming, formatos de envase, datos de producto
 * plausibles) pero usa un BRAND NAME 100% INVENTADO — verificado sin colisión
 * con marcas registradas reales — para no reemplazar un riesgo de copyright
 * por otro.
 * ---------------------------------------------------------------------------
 */

import type { BrandBrief } from "../lib/branding/generation-prompts";
import type { StyleId } from "../lib/branding/style-presets";

export const THUMBNAIL_BRIEFS: Record<StyleId, BrandBrief> = {
  // Grounded en tónicos/tinturas herbales reales (apothecary tonics: botella de
  // vidrio ámbar con gotero, sello circular, nombre evocador de botánica).
  // "Thistlewood Tonics" verificado (WebSearch) sin colisión con marca real.
  "neo-apotecario": {
    brandName: "Thistlewood Tonics",
    productType: "tintura herbal amarga digestiva",
    descriptor: "extracto de raíces y botánicos, 30ml",
    tagline: "Botica de siempre, ciencia de hoy",
    containerType: "botella de vidrio ámbar con gotero",
  },

  // Grounded en bebidas energéticas cítricas reales (Reign, Zest, Bang: lata de
  // aluminio, sabor cítrico llamativo, cafeína en mg). "Zestbolt" verificado
  // (WebSearch) sin colisión — existen "Zest" y "Reign Storm Citrus Zest" pero
  // ninguna marca real se llama "Zestbolt".
  "citrico-max": {
    brandName: "Zestbolt",
    productType: "bebida energética cítrica",
    descriptor: "explosión de naranja y lima, 150mg cafeína",
    tagline: "Carga a full",
    containerType: "lata de aluminio",
  },

  // Grounded en suplementos deportivos reales con dosis verificable (creatina
  // monohidratada, 5g por porción es la dosis estándar de la categoría — Legion
  // Recharge, Transparent Labs, 1st Phorm). "Ironvale Performance" verificado
  // (WebSearch) sin colisión exacta (existen "Ironclad Nutrition"/"Grit
  // Nutrition", ninguna idéntica).
  "clinical-performance": {
    brandName: "Ironvale Performance",
    productType: "creatina monohidratada en polvo",
    descriptor: "5g de creatina monohidratada por porción, sin sabor",
    tagline: "Rendimiento medible",
    containerType: "bote de plástico HDPE mate con scoop",
  },

  // Grounded en skincare/wellness premium real (Lumity, ASYSTEM, Necessaire:
  // envase soft-touch, faja estrecha, foil discreto). "Linen & Oat" verificado
  // (WebSearch) sin colisión con marca de skincare real.
  "rich-not-snobby": {
    brandName: "Linen & Oat",
    productType: "sérum facial calmante de avena coloidal",
    descriptor: "calma la piel sensible, uso diario",
    tagline: "Cuidado sin ruido",
    containerType: "frasco soft-touch mate con gotero",
  },

  // Grounded en té orgánico real en doypack con ventana (Meadow Ridge Coffee &
  // Tea, Smith Teamaker: hojas sueltas, botánica de fondo, sellos de
  // certificación). "Meadowline Tea Co." verificado (WebSearch) sin colisión
  // exacta (existen productos "Meadow Tea" genéricos, ninguna marca idéntica).
  botanico: {
    brandName: "Meadowline Tea Co.",
    productType: "té de hierbas orgánico en hojas",
    descriptor: "cultivo orgánico certificado, cosecha de temporada",
    tagline: "De la pradera a tu taza",
    containerType: "doypack de papel kraft con ventana",
  },

  // Grounded en objetos de diseño/fragancia editoriales reales (Comme des
  // Garçons Parfum, Régime des Fleurs: grilla suiza, asimetría, frasco como
  // objeto). "Atelier Nord" verificado (WebSearch) sin colisión con marca real.
  editorial: {
    brandName: "Atelier Nord",
    productType: "eau de parfum de autor",
    descriptor: "50ml · edición numerada",
    tagline: "Diseño que se huele",
    containerType: "frasco de perfume rectangular de vidrio",
  },

  // Grounded en bebidas energéticas Y2K reales (Bang, Reign: cromo, gradiente
  // holográfico, lata de aluminio). "Neon Static" verificado (WebSearch) sin
  // colisión con marca real.
  "future-nostalgia": {
    brandName: "Neon Static",
    productType: "bebida energética con gas",
    descriptor: "sabor ponche de frutas, edición holográfica",
    tagline: "Vuelve el futuro",
    containerType: "lata de aluminio cromada",
  },
};
