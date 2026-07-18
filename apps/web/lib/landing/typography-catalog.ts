import { z } from 'zod'

// Catálogo tipográfico CERRADO (invariante #3 de la migración): la tipografía sale de
// este enum, nunca de texto libre del LLM. Un nombre de fuente inventado es una fuente que
// no está bundleada → tofu. Cada par tiene un eje de nicho para que el casting (F3) elija.
//
// Módulo PURO (solo zod + datos) — SIN `fs`: lo importa `types.ts`, que a su vez consume el
// cliente (el wizard). La carga de los .ttf (fs) vive aparte en `./fonts` para no arrastrar
// `fs` al bundle del browser. Licencias: todas SIL OFL salvo Roboto/Lato (Apache-2.0).

export const TYPE_PAIRS = {
  'clinico-geometrico':  { display: 'Poppins',          body: 'Inter',         niche: 'salud, skincare, suplementos' },
  'dr-conversion':       { display: 'Montserrat',       body: 'Inter',         niche: 'oferta directa, DR agresivo, precios/conversión' },
  'wellness-humanista':  { display: 'Nunito',           body: 'Source Sans 3', niche: 'bienestar, natural, bebé' },
  'premium-serif':       { display: 'Playfair Display', body: 'Lato',          niche: 'belleza, joyería, lujo' },
  'urgencia-condensada': { display: 'Archivo Black',    body: 'Roboto',        niche: 'fitness, gadgets, oferta agresiva' },
  'tech-neutral':        { display: 'Space Grotesk',    body: 'Inter',         niche: 'electrónica, tecnología' },
  'calido-redondeado':   { display: 'Baloo 2',          body: 'Nunito Sans',   niche: 'hogar, cocina, mascotas' },
} as const

export const TypePairId = z.enum([
  'clinico-geometrico',
  'dr-conversion',
  'wellness-humanista',
  'premium-serif',
  'urgencia-condensada',
  'tech-neutral',
  'calido-redondeado',
])
export type TypePairId = z.infer<typeof TypePairId>
