// Clases compartidas por las secciones del wizard de video (el generador de anuncios
// las repite en cada sección; acá son cinco pantallas, así que viven en un solo sitio).
export const btnPrimary =
  'h-11 w-full rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export const btnGhost =
  'h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] text-[13px] font-semibold text-[#cfcfcf] hover:border-white/20 hover:text-[#ededed] disabled:opacity-40 transition-all duration-200 cursor-pointer font-sans flex items-center justify-center gap-2'

export const errorBox =
  'rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400'

// Advertencia bloqueante (ámbar, no rojo): no es un fallo del sistema, es un asset
// que el usuario tiene que cambiar para poder seguir.
export const warnBox =
  'rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[12px] leading-relaxed text-amber-300'

export const spinner =
  'w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin'
