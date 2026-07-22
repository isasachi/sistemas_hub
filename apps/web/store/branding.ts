'use client'

import { create } from 'zustand'
import type { BrandingSessionResponse } from '@/lib/branding/types'
import type { PaletteColor, Typography } from '@/lib/branding/style-presets'

export const SESSION_KEY = 'branding_session_id'

// Máquina de pasos del wizard de branding (refactor 2026-07, flujo por estilo).
// `step` = nº de secciones completadas; la sección activa es `step`.
//   0 Estilo · 1 Tu marca · 2 Paleta y tipografía · 3 Logo · 4 Etiqueta · 5 Mockup · 6 Guía (final)

// Subconjunto de ExtractedStyle (solo lo que consume la UI: la paleta/tipo
// "originales" para mostrar en el paso de paleta). `image_analysis` en DB es el
// ExtractedStyle completo — estructuralmente asignable acá, no hace falta el tipo entero.
type ExtractedStyleUi = { palette: PaletteColor[]; typography: Typography }

interface BrandingState {
  sessionId: string | null
  sessionError: boolean
  step: number
  // estilo
  sourceMode: 'preset' | 'upload' | null
  styleId: string | null
  uploadedImageUrl: string | null
  imageAnalysis: ExtractedStyleUi | null
  // brief
  brandName: string | null
  productName: string | null
  productType: string | null
  descriptor: string | null
  tagline: string | null
  containerType: string | null
  // paleta/tipo elegidas (null = default del estilo)
  selectedPalette: PaletteColor[] | null
  selectedTypography: Typography | null
  // resultados
  logoOptions: string[]
  logoUrl: string | null
  labelUrl: string | null
  mockupUrl: string | null
  // regeneraciones por kind
  regens: Record<string, number>
}

interface BrandingActions {
  setStep: (step: number) => void
  setStyle: (data: { sourceMode: 'preset' | 'upload'; styleId: string }) => void
  setUploaded: (data: {
    styleId: string
    uploadedImageUrl: string
    imageAnalysis: ExtractedStyleUi
    selectedPalette: PaletteColor[]
    selectedTypography: Typography
  }) => void
  setBrief: (data: {
    brandName: string
    productName: string
    productType: string
    descriptor: string
    tagline: string
    containerType: string
  }) => void
  setPaletteChoice: (data: { selectedPalette: PaletteColor[] | null; selectedTypography: Typography | null }) => void
  setLogoOptions: (logoOptions: string[]) => void
  selectLogo: (logoUrl: string) => void
  setLabel: (labelUrl: string) => void
  setMockup: (mockupUrl: string) => void
  hydrateFromSession: (s: BrandingSessionResponse) => void
  startNewSession: () => Promise<void>
  setRegens: (m: Record<string, number>) => void
  setRegen: (kind: string, n: number) => void
}

const initialState: BrandingState = {
  sessionId: null,
  sessionError: false,
  step: 0,
  sourceMode: null,
  styleId: null,
  uploadedImageUrl: null,
  imageAnalysis: null,
  brandName: null,
  productName: null,
  productType: null,
  descriptor: null,
  tagline: null,
  containerType: null,
  selectedPalette: null,
  selectedTypography: null,
  logoOptions: [],
  logoUrl: null,
  labelUrl: null,
  mockupUrl: null,
  regens: {},
}

export const useBrandingStore = create<BrandingState & BrandingActions>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setStyle: ({ sourceMode, styleId }) => set({ sourceMode, styleId, step: 1 }),

  // Modo B (upload): analyze ya devolvió estilo + paleta/tipo del producto real.
  setUploaded: ({ styleId, uploadedImageUrl, imageAnalysis, selectedPalette, selectedTypography }) =>
    set({
      sourceMode: 'upload',
      styleId,
      uploadedImageUrl,
      imageAnalysis,
      selectedPalette,
      selectedTypography,
      step: 1,
    }),

  setBrief: ({ brandName, productName, productType, descriptor, tagline, containerType }) =>
    set({ brandName, productName, productType, descriptor, tagline, containerType, step: 2 }),

  setPaletteChoice: ({ selectedPalette, selectedTypography }) =>
    set({ selectedPalette, selectedTypography, step: 3 }),

  setLogoOptions: (logoOptions) => set({ logoOptions }),

  selectLogo: (logoUrl) => set({ logoUrl, step: 4 }),

  setLabel: (labelUrl) => set({ labelUrl, step: 5 }),

  setMockup: (mockupUrl) => set({ mockupUrl, step: 6 }),

  hydrateFromSession: (s) => {
    if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, s.id)
    set({
      sessionId: s.id,
      step: s.step,
      sourceMode: s.source_mode,
      styleId: s.style_id,
      uploadedImageUrl: s.uploaded_image_url,
      imageAnalysis: s.image_analysis,
      brandName: s.brand_name,
      productName: s.product_name,
      productType: s.product_type,
      descriptor: s.descriptor,
      tagline: s.tagline,
      containerType: s.container_type,
      selectedPalette: s.selected_palette,
      selectedTypography: s.selected_typography,
      logoOptions: s.logo_options ?? [],
      logoUrl: s.logo_url,
      labelUrl: s.label_url,
      mockupUrl: s.mockup_url,
    })
  },

  setRegens: (regens) => set({ regens }),
  setRegen: (kind, n) => set((s) => ({ regens: { ...s.regens, [kind]: n } })),

  startNewSession: async () => {
    set({ ...initialState })
    try {
      const res = await fetch('/api/generador-branding/sessions', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { id } = (await res.json()) as { id: string }
      if (!id) throw new Error('Sin id de sesión')
      if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, id)
      set({ sessionId: id })
    } catch {
      set({ sessionError: true })
    }
  },
}))
