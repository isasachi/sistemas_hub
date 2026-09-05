'use client'

import { create } from 'zustand'
import type { ReferenceAnalysis, ProductScan, CopyVersions, ConfirmedCopy, SessionResponse, AdBatch } from '@/lib/types'

export const SESSION_KEY = 'anuncios_session_id'

interface WizardState {
  sessionId: string | null
  sessionError: boolean
  step: number
  isLoading: boolean
  referenceUrl: string | null
  referenceAnalysis: ReferenceAnalysis | null
  productUrl: string | null
  logoUrl: string | null
  productScan: ProductScan | null
  productName: string | null
  whatItIs: string | null
  whatItDoes: string | null
  targetAudience: string | null
  copyVersions: CopyVersions | null
  confirmedCopy: ConfirmedCopy | null
  imageUrl: string | null
  regens: Record<string, number>
  /**
   * Flujo de PLANTILLA. `templateId` null = flujo clásico (el usuario subió su referencia).
   * Los dos flujos comparten store y tabla: son la misma sesión con distinto punto de partida.
   */
  templateId: string | null
  variants: AdBatch | null
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
    whatItIs: string
    whatItDoes: string
    targetAudience: string
  }) => void
  setCopyVersions: (copyVersions: CopyVersions) => void
  setConfirmedCopy: (confirmedCopy: ConfirmedCopy) => void
  setImageUrl: (url: string) => void
  resetFromStep: (step: number) => void
  hydrateFromSession: (session: SessionResponse) => void
  startNewSession: () => Promise<void>
  ensureSession: () => Promise<string | null>
  resetSession: () => void
  setRegens: (m: Record<string, number>) => void
  setRegen: (kind: string, n: number) => void
  setTemplate: (templateId: string, referenceUrl: string, referenceAnalysis: ReferenceAnalysis) => void
  setVariants: (variants: AdBatch, step?: number) => void
  /** Reemplaza UNA variante por id — lo usa el stream del render, que llega de a una. */
  patchVariant: (v: AdBatch[number]) => void
}

const initialState: WizardState = {
  sessionId: null,
  sessionError: false,
  step: 0,
  isLoading: false,
  referenceUrl: null,
  referenceAnalysis: null,
  productUrl: null,
  logoUrl: null,
  productScan: null,
  productName: null,
  whatItIs: null,
  whatItDoes: null,
  targetAudience: null,
  copyVersions: null,
  confirmedCopy: null,
  imageUrl: null,
  regens: {},
  templateId: null,
  variants: null,
}

export const useWizardStore = create<WizardState & WizardActions>((set, get) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setStep: (step) => set({ step }),
  setLoading: (v) => set({ isLoading: v }),

  setReferenceData: ({ referenceUrl, referenceAnalysis }) =>
    set({ referenceUrl, referenceAnalysis, step: 1 }),

  setProductData: ({ productUrl, logoUrl, productScan, productName, whatItIs, whatItDoes, targetAudience }) =>
    set({ productUrl, logoUrl, productScan, productName, whatItIs, whatItDoes, targetAudience, step: 2 }),

  setCopyVersions: (copyVersions) => set({ copyVersions, step: 3 }),

  setConfirmedCopy: (confirmedCopy) => set({ confirmedCopy, step: 4 }),

  setImageUrl: (url) => set({ imageUrl: url }),

  resetFromStep: (step) => {
    const resets: Partial<WizardState> = { step }
    if (step <= 1) {
      Object.assign(resets, {
        referenceUrl: null, referenceAnalysis: null,
        productUrl: null, logoUrl: null, productScan: null,
        productName: null, whatItIs: null, whatItDoes: null, targetAudience: null,
        copyVersions: null, confirmedCopy: null, imageUrl: null,
      })
    } else if (step <= 2) {
      Object.assign(resets, {
        productUrl: null, logoUrl: null, productScan: null,
        productName: null, whatItIs: null, whatItDoes: null, targetAudience: null,
        copyVersions: null, confirmedCopy: null, imageUrl: null,
      })
    } else if (step <= 3) {
      Object.assign(resets, { copyVersions: null, confirmedCopy: null, imageUrl: null })
    } else if (step <= 4) {
      Object.assign(resets, { confirmedCopy: null, imageUrl: null })
    }
    set(resets)
  },

  hydrateFromSession: (session) => {
    if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, session.id)
    set({
      sessionId: session.id,
      step: session.step,
      referenceUrl: session.reference_url,
      referenceAnalysis: session.reference_analysis,
      productUrl: session.product_url,
      logoUrl: session.logo_url,
      productScan: session.product_scan,
      productName: session.product_name,
      whatItIs: session.what_it_is,
      whatItDoes: session.what_it_does,
      targetAudience: session.target_audience,
      copyVersions: session.copy_versions,
      confirmedCopy: session.confirmed_copy,
      imageUrl: session.image_url,
      templateId: session.template_id,
      variants: session.variants,
    })
  },

  setTemplate: (templateId, referenceUrl, referenceAnalysis) =>
    set({ templateId, referenceUrl, referenceAnalysis, step: 1, variants: null }),

  setVariants: (variants, step) => set(step === undefined ? { variants } : { variants, step }),

  patchVariant: (v) =>
    set((s) => ({ variants: (s.variants ?? []).map((x) => (x.id === v.id ? v : x)) })),

  setRegens: (regens) => set({ regens }),
  setRegen: (kind, n) => set((s) => ({ regens: { ...s.regens, [kind]: n } })),

  startNewSession: async () => {
    set({ ...initialState })
    try {
      const res = await fetch('/api/generador-anuncios/sessions', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { id } = (await res.json()) as { id: string }
      if (!id) throw new Error('Sin id de sesión')
      if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, id)
      set({ sessionId: id })
    } catch {
      set({ sessionError: true })
    }
  },

  /**
   * El id de la sesión, creándola si todavía no existe.
   *
   * ⚠️ ES LO QUE SACA LA CREACIÓN DE FILAS DEL MONTAJE DEL WIZARD: abrir la tool y no
   * hacer nada creaba una fila. El listado del dashboard las filtra al LEER, pero eso
   * ocultaba el síntoma — se seguían creando. Ver `ensureSession` en `store/video.ts`.
   */
  ensureSession: async () => {
    const actual = get().sessionId
    if (actual) return actual
    await get().startNewSession()
    return get().sessionId
  },

  /**
   * Vacía el wizard SIN crear ninguna fila.
   *
   * ⚠️ EXISTE POR UNA REGRESIÓN MEDIDA. Cuando el montaje del wizard creaba la sesión, el
   * botón "Empezar" de la intro (`ToolIntro.empezar`) solo tenía que borrar el id de
   * `localStorage` y navegar: el wizard llegaba vacío y creaba una fila nueva. Al mover la
   * creación al primer insumo, ese borrado dejó de alcanzar — **el store de zustand es un
   * singleton de MÓDULO y sobrevive la navegación del cliente**, así que el wizard se
   * remontaba con la sesión anterior todavía en memoria y el usuario aterrizaba en el
   * último paso de su sesión anterior en vez de en uno nuevo.
   */
  resetSession: () => set({ ...initialState }),
}))
