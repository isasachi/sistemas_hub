'use client'

import { create } from 'zustand'
import type { Direction, LabelData, BrandingSessionResponse } from '@/lib/branding/types'

export const SESSION_KEY = 'branding_session_id'

// Máquina de pasos del wizard de branding. `step` = nº de secciones completadas;
// la sección activa es `step` (espeja store/wizard.ts del generador de anuncios).
//   0 Brief · 1 Dirección · 2 Logo · 3 Etiqueta · 4 Mockup · 5 Guía (final)

interface BrandingState {
  sessionId: string | null
  sessionError: boolean
  step: number
  // brief
  brandName: string | null
  productName: string | null
  productCategory: string | null
  targetAudience: string | null
  personality: string[]
  briefNotes: string | null
  // dirección
  direction: Direction | null
  // logo
  logoOptions: string[]
  logoUrl: string | null
  logoReferenceUrl: string | null
  // etiqueta
  labelBrief: string | null
  labelData: LabelData | null
  labelReferenceUrl: string | null
  labelUrl: string | null
  // mockup
  containerMode: 'describe' | 'upload' | null
  containerDesc: string | null
  containerUrl: string | null
  mockupUrl: string | null
  // regeneraciones por kind
  regens: Record<string, number>
}

interface BrandingActions {
  setStep: (step: number) => void
  setBrief: (data: {
    brandName: string
    productName: string
    productCategory: string
    targetAudience: string
    personality: string[]
    briefNotes: string
  }) => void
  setDirection: (direction: Direction) => void
  approveDirection: () => void
  setLogoOptions: (logoOptions: string[]) => void
  setLogoReference: (url: string | null) => void
  selectLogo: (logoUrl: string) => void
  setLabelReference: (url: string | null) => void
  setLabel: (data: { labelData: LabelData; labelUrl: string }) => void
  setContainer: (data: { containerMode: 'describe' | 'upload'; containerDesc: string | null; containerUrl: string | null }) => void
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
  brandName: null,
  productName: null,
  productCategory: null,
  targetAudience: null,
  personality: [],
  briefNotes: null,
  direction: null,
  logoOptions: [],
  logoUrl: null,
  logoReferenceUrl: null,
  labelBrief: null,
  labelData: null,
  labelReferenceUrl: null,
  labelUrl: null,
  containerMode: null,
  containerDesc: null,
  containerUrl: null,
  mockupUrl: null,
  regens: {},
}

export const useBrandingStore = create<BrandingState & BrandingActions>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  // El brief queda guardado; la dirección llega aparte (setDirection) tras la
  // llamada estructurada, pero NO avanza de paso hasta que el usuario la aprueba.
  setBrief: ({ brandName, productName, productCategory, targetAudience, personality, briefNotes }) =>
    set({ brandName, productName, productCategory, targetAudience, personality, briefNotes, step: 1 }),

  setDirection: (direction) => set({ direction }),

  approveDirection: () => set({ step: 2 }),

  setLogoOptions: (logoOptions) => set({ logoOptions }),

  setLogoReference: (url) => set({ logoReferenceUrl: url }),

  selectLogo: (logoUrl) => set({ logoUrl, step: 3 }),

  setLabelReference: (url) => set({ labelReferenceUrl: url }),

  setLabel: ({ labelData, labelUrl }) => set({ labelData, labelUrl, step: 4 }),

  setContainer: ({ containerMode, containerDesc, containerUrl }) =>
    set({ containerMode, containerDesc, containerUrl }),

  setMockup: (mockupUrl) => set({ mockupUrl, step: 5 }),

  hydrateFromSession: (s) => {
    if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, s.id)
    set({
      sessionId: s.id,
      step: s.step,
      brandName: s.brand_name,
      productName: s.product_name,
      productCategory: s.product_category,
      targetAudience: s.target_audience,
      personality: s.personality ?? [],
      briefNotes: s.brief_notes,
      direction: s.direction,
      logoOptions: s.logo_options ?? [],
      logoUrl: s.logo_url,
      logoReferenceUrl: s.logo_reference_url,
      labelBrief: s.label_brief,
      labelData: s.label_data,
      labelReferenceUrl: s.label_reference_url,
      labelUrl: s.label_url,
      containerMode: s.container_mode,
      containerDesc: s.container_desc,
      containerUrl: s.container_url,
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
