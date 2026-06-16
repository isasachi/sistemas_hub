'use client'

import { create } from 'zustand'
import type { ReferenceAnalysis, ProductScan, CopyVersions, ConfirmedCopy, SessionResponse } from '@/lib/types'

interface WizardState {
  sessionId: string | null
  step: number
  isLoading: boolean
  referenceUrl: string | null
  referenceAnalysis: ReferenceAnalysis | null
  productUrl: string | null
  logoUrl: string | null
  productScan: ProductScan | null
  productName: string | null
  whatItDoes: string | null
  targetAudience: string | null
  copyVersions: CopyVersions | null
  confirmedCopy: ConfirmedCopy | null
  imageUrl: string | null
}

interface WizardActions {
  setSessionId: (id: string) => void
  setStep: (step: number) => void
  setLoading: (v: boolean) => void
  setReferenceData: (data: { referenceUrl: string; referenceAnalysis: ReferenceAnalysis }) => void
  setProductData: (data: {
    productUrl: string
    logoUrl: string | null
    productScan: ProductScan
    productName: string
    whatItDoes: string
    targetAudience: string
  }) => void
  setCopyVersions: (copyVersions: CopyVersions) => void
  setConfirmedCopy: (confirmedCopy: ConfirmedCopy) => void
  setImageUrl: (url: string) => void
  resetFromStep: (step: number) => void
  hydrateFromSession: (session: SessionResponse) => void
  startNewSession: () => Promise<void>
}

const initialState: WizardState = {
  sessionId: null,
  step: 0,
  isLoading: false,
  referenceUrl: null,
  referenceAnalysis: null,
  productUrl: null,
  logoUrl: null,
  productScan: null,
  productName: null,
  whatItDoes: null,
  targetAudience: null,
  copyVersions: null,
  confirmedCopy: null,
  imageUrl: null,
}

export const useWizardStore = create<WizardState & WizardActions>((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setStep: (step) => set({ step }),
  setLoading: (v) => set({ isLoading: v }),

  setReferenceData: ({ referenceUrl, referenceAnalysis }) =>
    set({ referenceUrl, referenceAnalysis, step: 1 }),

  setProductData: ({ productUrl, logoUrl, productScan, productName, whatItDoes, targetAudience }) =>
    set({ productUrl, logoUrl, productScan, productName, whatItDoes, targetAudience, step: 2 }),

  setCopyVersions: (copyVersions) => set({ copyVersions, step: 3 }),

  setConfirmedCopy: (confirmedCopy) => set({ confirmedCopy, step: 4 }),

  setImageUrl: (url) => set({ imageUrl: url }),

  resetFromStep: (step) => {
    const resets: Partial<WizardState> = { step }
    if (step <= 1) {
      Object.assign(resets, {
        referenceUrl: null, referenceAnalysis: null,
        productUrl: null, logoUrl: null, productScan: null,
        productName: null, whatItDoes: null, targetAudience: null,
        copyVersions: null, confirmedCopy: null, imageUrl: null,
      })
    } else if (step <= 2) {
      Object.assign(resets, {
        productUrl: null, logoUrl: null, productScan: null,
        productName: null, whatItDoes: null, targetAudience: null,
        copyVersions: null, confirmedCopy: null, imageUrl: null,
      })
    } else if (step <= 3) {
      Object.assign(resets, { copyVersions: null, confirmedCopy: null, imageUrl: null })
    } else if (step <= 4) {
      Object.assign(resets, { confirmedCopy: null, imageUrl: null })
    }
    set(resets)
  },

  hydrateFromSession: (session) =>
    set({
      sessionId: session.id,
      step: session.step,
      referenceUrl: session.reference_url,
      referenceAnalysis: session.reference_analysis,
      productUrl: session.product_url,
      logoUrl: session.logo_url,
      productScan: session.product_scan,
      productName: session.product_name,
      whatItDoes: session.what_it_does,
      targetAudience: session.target_audience,
      copyVersions: session.copy_versions,
      confirmedCopy: session.confirmed_copy,
      imageUrl: session.image_url,
    }),

  startNewSession: async () => {
    set({ ...initialState })
    const res = await fetch('/api/sessions', { method: 'POST' })
    const { id } = (await res.json()) as { id: string }
    set({ sessionId: id })
  },
}))
