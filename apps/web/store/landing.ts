'use client'

import { create } from 'zustand'
import type { SectionType, SectionCopy, LandingSection, LandingSessionResponse } from '@/lib/landing/types'

export const SESSION_KEY = 'landing_session_id'

// Máquina de pasos del wizard de landing. `step` = nº de secciones completadas.
//   0 Producto · 1 Fotos · 2 Plantilla · 3 Secciones+copy · 4 Preview (final)

interface LandingState {
  sessionId: string | null
  step: number
  productName: string | null
  price: string | null
  benefits: string | null
  audience: string | null
  tone: string[]
  productPhotoUrls: string[]
  template: string | null
  selectedSections: SectionType[]
  copy: SectionCopy[]
  sections: LandingSection[]
}

interface LandingActions {
  setStep: (step: number) => void
  setDetails: (data: { productName: string; price: string; benefits: string; audience: string; tone: string[] }) => void
  setPhotos: (urls: string[]) => void
  setTemplate: (template: string) => void
  setSelectedSections: (sections: SectionType[]) => void
  setCopy: (copy: SectionCopy[]) => void
  approveCopy: () => void
  setSectionImage: (section: LandingSection) => void
  setSections: (sections: LandingSection[]) => void
  hydrateFromSession: (s: LandingSessionResponse) => void
  startNewSession: () => Promise<void>
}

const initialState: LandingState = {
  sessionId: null,
  step: 0,
  productName: null,
  price: null,
  benefits: null,
  audience: null,
  tone: [],
  productPhotoUrls: [],
  template: null,
  selectedSections: [],
  copy: [],
  sections: [],
}

export const useLandingStore = create<LandingState & LandingActions>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setDetails: ({ productName, price, benefits, audience, tone }) =>
    set({ productName, price, benefits, audience, tone, step: 1 }),

  setPhotos: (urls) => set({ productPhotoUrls: urls, step: 2 }),

  setTemplate: (template) => set({ template, step: 3 }),

  setSelectedSections: (selectedSections) => set({ selectedSections }),

  setCopy: (copy) => set({ copy }),

  approveCopy: () => set({ step: 4 }),

  // Upsert por tipo: el evento progress del SSE va llenando el array.
  setSectionImage: (section) =>
    set((s) => {
      const rest = s.sections.filter((x) => x.type !== section.type)
      return { sections: [...rest, section].sort((a, b) => a.order - b.order) }
    }),

  setSections: (sections) => set({ sections: [...sections].sort((a, b) => a.order - b.order) }),

  hydrateFromSession: (s) => {
    if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, s.id)
    set({
      sessionId: s.id,
      step: s.step,
      productName: s.product_name,
      price: s.price,
      benefits: s.benefits,
      audience: s.audience,
      tone: s.tone ?? [],
      productPhotoUrls: s.product_photo_urls ?? [],
      template: s.template,
      selectedSections: s.selected_sections ?? [],
      copy: s.copy ?? [],
      sections: (s.sections ?? []).slice().sort((a, b) => a.order - b.order),
    })
  },

  startNewSession: async () => {
    set({ ...initialState })
    const res = await fetch('/api/generador-landing/sessions', { method: 'POST' })
    const { id } = (await res.json()) as { id: string }
    if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, id)
    set({ sessionId: id })
  },
}))
