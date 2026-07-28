'use client'

import { create } from 'zustand'
import type { BrandingSessionResponse, ExtractedStyle, PaletteColor } from '@/lib/branding/types'

export const SESSION_KEY = 'branding_session_id'

// Máquina de pasos del wizard de branding (migración plantillas 2026-07 — se
// invierte el orden: el brief va primero porque la galería de plantillas
// necesita saber qué vende el usuario para poder resaltar las que matchean).
// `step` = nº de secciones completadas; la sección activa es `step`.
//   0 Tu marca (brief) · 1 Plantilla · 2 Marca (logo→etiqueta→mockup, auto-orquestado) · 3 Guía (final)

interface BrandingState {
  sessionId: string | null
  sessionError: boolean
  step: number
  // plantilla / referencia
  sourceMode: 'preset' | 'template' | 'upload' | null
  categoryId: string | null
  templateId: string | null
  paletteVariant: number
  paletteOptions: PaletteColor[][] | null
  uploadedImageUrl: string | null
  imageAnalysis: ExtractedStyle | null
  // brief
  brandName: string | null
  productName: string | null
  productType: string | null
  descriptor: string | null
  tagline: string | null
  containerType: string | null
  // resultados
  logoUrl: string | null
  labelUrl: string | null
  mockupUrl: string | null
  // regeneraciones por kind
  regens: Record<string, number>
}

interface BrandingActions {
  setStep: (step: number) => void
  setCategory: (categoryId: string) => void
  setTemplate: (data: { templateId: string; paletteVariant: number }) => void
  setUploaded: (data: { uploadedImageUrl: string; imageAnalysis: ExtractedStyle | null; paletteOptions: PaletteColor[][] | null }) => void
  setBrief: (data: {
    categoryId: string
    brandName: string
    productName: string
    productType: string
    descriptor: string
    tagline: string
    containerType: string
  }) => void
  setMockup: (mockupUrl: string) => void
  setLogo: (logoUrl: string) => void
  setLabel: (labelUrl: string) => void
  goToGuide: () => void
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
  categoryId: null,
  templateId: null,
  paletteVariant: 0,
  paletteOptions: null,
  uploadedImageUrl: null,
  imageAnalysis: null,
  brandName: null,
  productName: null,
  productType: null,
  descriptor: null,
  tagline: null,
  containerType: null,
  logoUrl: null,
  labelUrl: null,
  mockupUrl: null,
  regens: {},
}

export const useBrandingStore = create<BrandingState & BrandingActions>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setCategory: (categoryId) => set({ categoryId }),

  // El brief es el paso 0 y la plantilla el paso 1 (ver BrandingWizard).
  setTemplate: ({ templateId, paletteVariant }) =>
    set({ sourceMode: 'template', templateId, paletteVariant, step: 2 }),

  setUploaded: ({ uploadedImageUrl, imageAnalysis, paletteOptions }) =>
    set({ sourceMode: 'upload', uploadedImageUrl, imageAnalysis, paletteOptions, paletteVariant: 0, step: 2 }),

  // El brief es el paso 0: al completarlo se avanza a elegir plantilla (paso 1).
  setBrief: ({ categoryId, brandName, productName, productType, descriptor, tagline, containerType }) =>
    set({ categoryId, brandName, productName, productType, descriptor, tagline, containerType, step: 1 }),

  // Pipeline secuencial logo→etiqueta→mockup: cada paso persiste su propia URL
  // al terminar. El paso 2 "Marca" sigue activo (muestra los 3 con sus regens)
  // hasta que el usuario confirma con "Continuar a la guía" → goToGuide. No
  // tocar `step` acá.
  setMockup: (mockupUrl) => set({ mockupUrl }),

  setLogo: (logoUrl) => set({ logoUrl }),

  setLabel: (labelUrl) => set({ labelUrl }),

  goToGuide: () => set({ step: 3 }),

  hydrateFromSession: (s) => {
    if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, s.id)
    set({
      sessionId: s.id,
      step: s.step,
      sourceMode: s.source_mode,
      imageAnalysis: s.image_analysis,
      categoryId: s.product_category,
      templateId: s.template_id,
      paletteVariant: s.palette_variant ?? 0,
      paletteOptions: s.palette_options,
      uploadedImageUrl: s.uploaded_image_url,
      brandName: s.brand_name,
      productName: s.product_name,
      productType: s.product_type,
      descriptor: s.descriptor,
      tagline: s.tagline,
      containerType: s.container_type,
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
