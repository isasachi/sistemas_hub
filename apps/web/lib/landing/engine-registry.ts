import type { SectionType } from './types'

// Secciones migradas al motor HÍBRIDO (escena Gemini sin texto + composición Satori). Las que
// NO están acá usan el motor viejo (`buildSectionInstruction`, imagen íntegra con texto). Se
// va llenando por fase; la ruta de sección bifurca según este set. Con el set vacío, el
// comportamiento es idéntico al de antes de la migración. Ver migration/MIGRATION.md §5.
export const HYBRID_SECTIONS: Set<SectionType> = new Set([
  'hero', 'oferta', 'antes-despues', 'beneficios', 'testimonios', 'garantia', 'faq', 'cta-final',
])

// Secciones que NO reciben el talento canónico. `testimonios` muestra clientes DISTINTOS (sus
// avatares se generan aparte). `faq` y `beneficios` no llevan persona en el ADN (solo producto +
// motivos): pasarles el talento mete una figura que la composición tapa. El talento es para el/la
// protagonista de la campaña (hero, oferta, antes/después, garantía, cta).
export const NO_TALENT_SECTIONS: Set<SectionType> = new Set(['testimonios', 'faq', 'beneficios'])
