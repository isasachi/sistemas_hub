'use client'

import { create } from 'zustand'
import type { SectionType, SectionCopy, LandingSection, LandingSessionResponse, DerivedBrand, TrustBlock, Offer } from '@/lib/landing/types'

export const SESSION_KEY = 'landing_session_id'

// Máquina de pasos del wizard de landing. `step` = etapa alcanzada.
//   0 Producto · 1 Fotos · 2 Identidad visual · 3 Confianza y pagos · 4 Secciones+copy · 5 Preview
//   La plantilla ya no es un paso: el análisis es interno (plantilla maestra).
//   Identidad (F3): revisión bloqueante de la marca derivada antes de generar imagen.
//   Confianza (F5): el usuario carga los hechos operativos (contraentrega/pagos/garantía).

interface LandingState {
  sessionId: string | null
  sessionError: boolean
  step: number
  productName: string | null
  price: string | null
  benefits: string | null
  audience: string | null
  tone: string[]
  productLabels: string | null
  productPhotoUrls: string[]
  derivedBrand: DerivedBrand | null
  talentUrl: string | null
  trustBlock: TrustBlock | null
  offer: Offer | null
  selectedSections: SectionType[]
  copy: SectionCopy[]
  sections: LandingSection[]
  regens: Record<string, number>
}

interface LandingActions {
  setStep: (step: number) => void
  setDetails: (data: { productName: string; price: string; benefits: string; audience: string; tone: string[]; productLabels: string }) => void
  setPhotos: (urls: string[]) => void
  setDerivedBrand: (brand: DerivedBrand | null) => void
  setTalentUrl: (url: string | null) => void
  confirmIdentity: () => void
  setTrustBlock: (trust: TrustBlock | null) => void
  confirmTrust: () => void
  setSelectedSections: (sections: SectionType[]) => void
  setCopy: (copy: SectionCopy[]) => void
  approveCopy: () => void
  setSectionImage: (section: LandingSection) => void
  setSections: (sections: LandingSection[]) => void
  hydrateFromSession: (s: LandingSessionResponse) => void
  startNewSession: () => Promise<void>
  setRegens: (m: Record<string, number>) => void
  setRegen: (kind: string, n: number) => void
}

const initialState: LandingState = {
  sessionId: null,
  sessionError: false,
  step: 0,
  productName: null,
  price: null,
  benefits: null,
  audience: null,
  tone: [],
  productLabels: null,
  productPhotoUrls: [],
  derivedBrand: null,
  talentUrl: null,
  trustBlock: null,
  offer: null,
  selectedSections: [],
  copy: [],
  sections: [],
  regens: {},
}

export const useLandingStore = create<LandingState & LandingActions>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setDetails: ({ productName, price, benefits, audience, tone, productLabels }) =>
    set({ productName, price, benefits, audience, tone, productLabels, step: 1 }),

  setPhotos: (urls) => set({ productPhotoUrls: urls, step: 2 }),

  setDerivedBrand: (derivedBrand) => set({ derivedBrand }),

  setTalentUrl: (talentUrl) => set({ talentUrl }),

  // Confirmación del checkpoint bloqueante de identidad → avanza a Confianza y pagos.
  confirmIdentity: () => set({ step: 3 }),

  setTrustBlock: (trustBlock) => set({ trustBlock }),

  // Confirmación del bloque de confianza → avanza a Secciones+copy.
  confirmTrust: () => set({ step: 4 }),

  setSelectedSections: (selectedSections) => set({ selectedSections }),

  setCopy: (copy) => set({ copy }),

  approveCopy: () => set({ step: 5 }),

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
      productLabels: s.product_labels,
      productPhotoUrls: s.product_photo_urls ?? [],
      derivedBrand: s.derived_brand ?? null,
      talentUrl: s.talent_canonical_url ?? null,
      trustBlock: s.trust_block ?? null,
      offer: s.offer ?? null,
      selectedSections: s.selected_sections ?? [],
      copy: s.copy ?? [],
      sections: (s.sections ?? []).slice().sort((a, b) => a.order - b.order),
    })
  },

  setRegens: (regens) => set({ regens }),
  setRegen: (kind, n) => set((s) => ({ regens: { ...s.regens, [kind]: n } })),

  startNewSession: async () => {
    set({ ...initialState })
    try {
      const res = await fetch('/api/generador-landing/sessions', { method: 'POST' })
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
