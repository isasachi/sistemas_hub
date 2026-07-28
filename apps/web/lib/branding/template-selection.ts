// Selección local del paso 2 (plantilla + paleta) — extraído de Section2Template
// para poder testear sin un harness de render. AccordionSection solo renderiza
// el paso activo, así que reabrir un paso completado remonta el componente: su
// useState local debe sembrarse desde el store o la elección previa se pierde
// en silencio (ver AGENTS.md / task-11).

export interface TemplateSelection {
  picked: string | null
  variant: number
}

// Al montar (primera vez o al reabrir un paso ya completado), la selección
// local arranca desde lo que ya hay en el store — si no, el usuario ve la
// plantilla sin resaltar y los chips de paleta ocultos hasta que vuelva a
// tocar la tarjeta. Sin plantilla elegida, la paleta no tiene contra qué
// indexar: variant siempre 0.
export function seedSelection(storeTemplateId: string | null, storePaletteVariant: number): TemplateSelection {
  return { picked: storeTemplateId, variant: storeTemplateId ? storePaletteVariant : 0 }
}

// Elegir la MISMA plantilla que ya estaba elegida conserva la paleta (el
// usuario solo está re-confirmando lo que tenía); elegir una plantilla
// DISTINTA resetea a la paleta 0 — un índice de paleta solo es significativo
// relativo a las paletas de su propia plantilla.
export function selectTemplate(current: TemplateSelection, templateId: string): TemplateSelection {
  return { picked: templateId, variant: current.picked === templateId ? current.variant : 0 }
}
