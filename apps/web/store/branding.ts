'use client'

import { create } from 'zustand'
import type { Direction, BrandingSessionResponse } from '@/lib/branding/types'

// Máquina de pasos del wizard de branding. `step` = nº de secciones completadas;
// la sección activa es `step` (espeja store/wizard.ts del generador de anuncios).
//   0 Brief · 1 Dirección · 2 Logo · 3 Etiqueta · 4 Mockup · 5 Guía (final)

interface BrandingState {
  sessionId: string | null
  step: number
  // brief
  brandName: string | null
  productCategory: string | null
  targetAudience: string | null
  personality: string[]
  briefNotes: string | null
  // dirección
  direction: Direction | null
  // logo
  logoOptions: string[]
  logoUrl: string | null
  // etiqueta
  labelBrief: string | null
  labelUrl: string | null
  // mockup
  containerMode: 'describe' | 'upload' | null
  containerDesc: string | null
  containerUrl: string | null
  mockupUrl: string | null
}

interface BrandingActions {
  setStep: (step: number) => void
  setBrief: (data: {
    brandName: string
    productCategory: string
    targetAudience: string
    personality: string[]
    briefNotes: string
  }) => void
  setDirection: (direction: Direction) => void
  approveDirection: () => void
  setLogoOptions: (logoOptions: string[]) => void
  selectLogo: (logoUrl: string) => void
  setLabel: (data: { labelBrief: string; labelUrl: string }) => void
  setContainer: (data: { containerMode: 'describe' | 'upload'; containerDesc: string | null; containerUrl: string | null }) => void
  setMockup: (mockupUrl: string) => void
  hydrateFromSession: (s: BrandingSessionResponse) => void
  startNewSession: () => Promise<void>
}

const initialState: BrandingState = {
  sessionId: null,
  step: 0,
  brandName: null,
  productCategory: null,
  targetAudience: null,
  personality: [],
  briefNotes: null,
  direction: null,
  logoOptions: [],
  logoUrl: null,
  labelBrief: null,
  labelUrl: null,
  containerMode: null,
  containerDesc: null,
  containerUrl: null,
  mockupUrl: null,
}

export const useBrandingStore = create<BrandingState & BrandingActions>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  // El brief queda guardado; la dirección llega aparte (setDirection) tras la
  // llamada estructurada, pero NO avanza de paso hasta que el usuario la aprueba.
  setBrief: ({ brandName, productCategory, targetAudience, personality, briefNotes }) =>
    set({ brandName, productCategory, targetAudience, personality, briefNotes, step: 1 }),

  setDirection: (direction) => set({ direction }),

  approveDirection: () => set({ step: 2 }),

  setLogoOptions: (logoOptions) => set({ logoOptions }),

  selectLogo: (logoUrl) => set({ logoUrl, step: 3 }),

  setLabel: ({ labelBrief, labelUrl }) => set({ labelBrief, labelUrl, step: 4 }),

  setContainer: ({ containerMode, containerDesc, containerUrl }) =>
    set({ containerMode, containerDesc, containerUrl }),

  setMockup: (mockupUrl) => set({ mockupUrl, step: 5 }),

  hydrateFromSession: (s) =>
    set({
      sessionId: s.id,
      step: s.step,
      brandName: s.brand_name,
      productCategory: s.product_category,
      targetAudience: s.target_audience,
      personality: s.personality ?? [],
      briefNotes: s.brief_notes,
      direction: s.direction,
      logoOptions: s.logo_options ?? [],
      logoUrl: s.logo_url,
      labelBrief: s.label_brief,
      labelUrl: s.label_url,
      containerMode: s.container_mode,
      containerDesc: s.container_desc,
      containerUrl: s.container_url,
      mockupUrl: s.mockup_url,
    }),

  startNewSession: async () => {
    set({ ...initialState })
    const res = await fetch('/api/generador-branding/sessions', { method: 'POST' })
    const { id } = (await res.json()) as { id: string }
    set({ sessionId: id })
  },
}))
