import type { SectionType } from './types'

// Secciones migradas al motor HÍBRIDO (escena Gemini sin texto + composición Satori). Las que
// NO están acá usan el motor viejo (`buildSectionInstruction`, imagen íntegra con texto). Se
// va llenando por fase; la ruta de sección bifurca según este set. Con el set vacío, el
// comportamiento es idéntico al de antes de la migración. Ver migration/MIGRATION.md §5.
export const HYBRID_SECTIONS: Set<SectionType> = new Set()
