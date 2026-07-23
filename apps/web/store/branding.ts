'use client'

import { create } from 'zustand'
import type { BrandingSessionResponse } from '@/lib/branding/types'

export const SESSION_KEY = 'branding_session_id'

// Máquina de pasos del wizard de branding (migración fase 10 — se elimina el
// paso de paleta/tipografía, identidad fija: paleta/tipo SIEMPRE del preset).
// `step` = nº de secciones completadas; la sección activa es `step`.
//   0 Estilo · 1 Tu marca · 2 Marca (compose→derivar, auto-orquestado) · 3 Guía (final)

interface BrandingState {
  sessionId: string | null
  sessionError: boolean
  step: number
  // estilo
  sourceMode: 'preset' | 'upload' | null
  styleId: string | null
  uploadedImageUrl: string | null
  // brief
  brandName: string | null
  productName: string | null
  productType: string | null
  descriptor: string | null
  tagline: string | null
  containerType: string | null
  // resultados
  mockupOptions: string[]
  logoUrl: string | null
  labelUrl: string | null
  mockupUrl: string | null
  // regeneraciones por kind
  regens: Record<string, number>
}

interface BrandingActions {
  setStep: (step: number) => void
  setStyle: (data: { sourceMode: 'preset' | 'upload'; styleId: string }) => void
  setUploaded: (data: { styleId: string; uploadedImageUrl: string }) => void
  setBrief: (data: {
    brandName: string
    productName: string
    productType: string
    descriptor: string
    tagline: string
    containerType: string
  }) => void
  setMockupOptions: (mockupOptions: string[]) => void
  setMockup: (mockupUrl: string) => void
  setDerived: (data: { logoUrl: string; labelUrl: string; mockupUrl: string }) => void
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
  styleId: null,
  uploadedImageUrl: null,
  brandName: null,
  productName: null,
  productType: null,
  descriptor: null,
  tagline: null,
  containerType: null,
  mockupOptions: [],
  logoUrl: null,
  labelUrl: null,
  mockupUrl: null,
  regens: {},
}

export const useBrandingStore = create<BrandingState & BrandingActions>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setStyle: ({ sourceMode, styleId }) => set({ sourceMode, styleId, step: 1 }),

  // Modo B (upload): analyze ya devolvió el estilo asignado (bestFitStyleId,
  // identidad fija — lo demás extraído de la imagen se descarta server-side).
  setUploaded: ({ styleId, uploadedImageUrl }) =>
    set({ sourceMode: 'upload', styleId, uploadedImageUrl, step: 1 }),

  setBrief: ({ brandName, productName, productType, descriptor, tagline, containerType }) =>
    set({ brandName, productName, productType, descriptor, tagline, containerType, step: 2 }),

  setMockupOptions: (mockupOptions) => set({ mockupOptions }),

  // Mockup compuesto (compose, antes de derivar logo+etiqueta).
  setMockup: (mockupUrl) => set({ mockupUrl }),

  // derive({target:'both'}) deja los 3 artefactos consistentes. El paso 2
  // "Marca" sigue activo (muestra los 3 con sus regens) hasta que el usuario
  // confirma con "Continuar a la guía" → goToGuide. No tocar `step` acá.
  setDerived: ({ logoUrl, labelUrl, mockupUrl }) => set({ logoUrl, labelUrl, mockupUrl }),

  setLogo: (logoUrl) => set({ logoUrl }),

  setLabel: (labelUrl) => set({ labelUrl }),

  goToGuide: () => set({ step: 3 }),

  hydrateFromSession: (s) => {
    if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, s.id)
    set({
      sessionId: s.id,
      step: s.step,
      sourceMode: s.source_mode,
      styleId: s.style_id,
      uploadedImageUrl: s.uploaded_image_url,
      brandName: s.brand_name,
      productName: s.product_name,
      productType: s.product_type,
      descriptor: s.descriptor,
      tagline: s.tagline,
      containerType: s.container_type,
      mockupOptions: s.mockup_options ?? [],
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
