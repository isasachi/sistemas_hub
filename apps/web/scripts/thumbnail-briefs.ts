/**
 * thumbnailBriefs.ts
 * ---------------------------------------------------------------------------
 * Un BrandBrief por cada uno de los 12 estilos de STYLE_PRESETS, usado por
 * `gen-thumbnails.ts` para generar el thumbnail (mockup compuesto) del picker
 * del generador de marca — reemplaza las imágenes scrapeadas de marcas reales
 * (branding-refs/<folder>/ref_1..5), que sí se siguen usando como STYLE REFS
 * internas para Gemini, pero ya no deben mostrarse como thumbnail visible.
 *
 * Cada brief está GROUNDED en una categoría de producto real (investigada vía
 * WebSearch: convenciones de naming, formatos de envase, datos de producto
 * plausibles) pero usa un BRAND NAME 100% INVENTADO — nunca una marca
 * registrada real — para no reemplazar un riesgo de copyright por otro.
 * ---------------------------------------------------------------------------
 */

import type { BrandBrief } from "../lib/branding/generation-prompts";
import type { StyleId } from "../lib/branding/style-presets";

export const THUMBNAIL_BRIEFS: Record<StyleId, BrandBrief> = {
  // Grounded en skincare minimalista real (Byredo/Le Labo-style, "menos ingredientes,
  // más resultados"): nombres cortos, cálidos, sin caps agresivas; ácido hialurónico
  // en frasco gotero de vidrio es el formato dominante de la categoría.
  minimalista: {
    brandName: "AELUM",
    productType: "sérum facial de ácido hialurónico",
    descriptor: "hidratación 24h, fórmula de 5 ingredientes",
    tagline: "Menos, pero mejor",
    containerType: "frasco de vidrio con gotero",
  },

  // Grounded en perfumería de lujo real: convención "Maison <apellido inventado>",
  // concentración eau de parfum, formato 50ml, notas descritas en el envase.
  lujo: {
    brandName: "Maison Verelle",
    productType: "eau de parfum",
    descriptor: "50ml · notas de ámbar, azahar y sándalo",
    tagline: "Un lujo silencioso",
    containerType: "frasco de perfume con tapa dorada",
  },

  // Grounded en soda mid-century real (Orange Crush, Nehi, NuGrape: nombre corto +
  // imaginario retro, botella de vidrio, "receta original desde..."). Verificado
  // (WebSearch) que no colisiona con marcas históricas reales de cola (a diferencia
  // de "Comet"/"Sunspot"/"Jubilo", todas ya usadas por sodas reales).
  "vintage-retro": {
    brandName: "Amberline Cola",
    productType: "refresco de cola",
    descriptor: "receta original desde 1958",
    tagline: "El sabor que no pasa de moda",
    containerType: "botella de vidrio retornable",
  },

  // Grounded en granola bars orgánicas reales (Skout Organic, Grandy Organics: nombre
  // que evoca tierra/ingredientes simples, doypack kraft, "ingredientes 100% naturales").
  "organico-eco": {
    brandName: "Rootfare",
    productType: "barra de granola de avena y dátil",
    descriptor: "ingredientes 100% naturales, sin azúcar añadida",
    tagline: "De la tierra, para ti",
    containerType: "doypack de papel kraft",
  },

  // Grounded en hot sauce maximalista real (Stuzzi, Blair's, Scorned Woman: nombres
  // provocadores/de culto, botella de vidrio angosta, tono irreverente).
  "bold-maximalista": {
    brandName: "Cult Flame",
    productType: "salsa picante extra hot",
    descriptor: "pica fuerte, sabor a chile tostado",
    tagline: "Adicción certificada",
    containerType: "botella de vidrio para salsa picante",
  },

  // Grounded en matcha japandi real (Ippodo, Tea Fujiki: nombre corto de sonido
  // japonés + concepto de calma, lata/tin de matcha ceremonial grado sombra).
  japandi: {
    brandName: "Nagi Matcha",
    productType: "matcha ceremonial en polvo",
    descriptor: "cultivo de sombra, grado ceremonial",
    tagline: "Quietud en cada taza",
    containerType: "lata de matcha",
  },

  // Grounded en craft beer hand-drawn real (Novel Stand, Sturgis Brewing: nombre de
  // mascota/animal + "Brewing", botella con etiqueta serigrafiada a mano).
  "hand-drawn-artesanal": {
    brandName: "Tin Owl Brewing",
    productType: "cerveza artesanal India Pale Ale",
    descriptor: "lupulado en pequeños lotes",
    tagline: "Cervecería de barrio",
    containerType: "botella de cerveza con etiqueta serigrafiada",
  },

  // Grounded en audio tech real (Sony WF, Nothing Ear: nombre corto abstracto +
  // categoría, caja de carga + empaque rígido blanco/negro con acento holográfico).
  "moderno-tech": {
    brandName: "Vesta Audio",
    productType: "audífonos inalámbricos true wireless",
    descriptor: "cancelación activa de ruido",
    tagline: "Sonido sin límites",
    containerType: "estuche de carga con caja rígida",
  },

  // Grounded en energy drinks Y2K reales (Bang: cromado, gradientes holográficos,
  // sabores frutales llamativos, lata de aluminio). "Glitch Energy" (candidato
  // inicial) es una marca REAL registrada de energy drink gamer — descartada tras
  // verificar con WebSearch; "Pixel Rush" no arrojó colisión.
  "colorido-y2k": {
    brandName: "Pixel Rush",
    productType: "bebida energética",
    descriptor: "sabor a frutas tropicales, 160mg cafeína",
    tagline: "Recarga en modo turbo",
    containerType: "lata de aluminio",
  },

  // Grounded en suplementos reales (Nature Made, Solgar: dosis en IU/mcg, softgel,
  // frasco blanco farmacéutico — usa el mismo ejemplo del brief de la tarea).
  "farmaceutico-clean": {
    brandName: "Vitaluma",
    productType: "Vitamina D3 2000 UI cápsulas blandas",
    descriptor: "soporte inmune y óseo, uso diario",
    tagline: "Ciencia simple, cuidado diario",
    containerType: "frasco farmacéutico blanco",
  },

  // Grounded en café premium con foil dorado real (Ampersand, Canyon Coffee: bolsa
  // mate oscura con foil, tueste oscuro de edición limitada).
  "gold-foil-dorado": {
    brandName: "Aurel Coffee Roasters",
    productType: "café de tueste oscuro de origen único",
    descriptor: "tueste oscuro, edición limitada",
    tagline: "El lujo de despertar",
    containerType: "bolsa de café mate con foil dorado",
  },

  // Grounded en leches vegetales reales con packaging geométrico plano (Milkadamia,
  // Veganz Mililk: nombre corto moderno, cartón de leche, foco en simplicidad).
  "flat-geometrico": {
    brandName: "Prisma",
    productType: "leche de avena",
    descriptor: "sin azúcar añadida, fortificada con calcio",
    tagline: "Simple. Redondo. Bueno.",
    containerType: "cartón de leche",
  },
};
