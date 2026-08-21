'use client'

import { create } from 'zustand'
import type {
  ForensicReport, ProductScan, UserInputs, ValidationMatrix, ScriptTemplate, VideoSessionResponse,
} from '@/lib/video-ads/types'
import type { AdaptedScript } from '@/lib/video-ads/adapt'
import type { VoiceProfile } from '@/lib/video-ads/character'
import type { Lote } from '@/lib/video-ads/lotes'
import { STEP } from '@/lib/video-ads/steps'

export const SESSION_KEY = 'video_ads_session_id'

interface VideoState {
  sessionId: string | null
  sessionError: boolean
  step: number
  isLoading: boolean
  referenceVideoUrl: string | null
  forensicAnalysis: ForensicReport | null
  productUrl: string | null
  productScan: ProductScan | null
  characterUrl: string | null
  // INPUTS
  inputs: UserInputs
  validation: ValidationMatrix | null
  // FASE 2
  template: ScriptTemplate | null
  regens: Record<string, number>
  // FASE 3
  adapted: AdaptedScript | null
  // FASE 4 / 4.5
  consistencyBlock: string | null
  voiceProfile: VoiceProfile | null
  // FASE 5
  lotes: Lote[] | null
}

export const EMPTY_INPUTS: UserInputs = {
  productName: '', productDescription: '', angle: '', targetAudience: '',
  problem: '', characterDesc: '', characterEthnicity: '', accent: '',
  voice: '', constraints: '', characterUrl: undefined,
}

const initialState: VideoState = {
  sessionId: null, sessionError: false, step: STEP.REFERENCE, isLoading: false,
  referenceVideoUrl: null, forensicAnalysis: null,
  productUrl: null, productScan: null, characterUrl: null,
  inputs: EMPTY_INPUTS, validation: null, template: null, regens: {},
  adapted: null, consistencyBlock: null, voiceProfile: null, lotes: null,
}

interface VideoActions {
  setStep: (step: number) => void
  setLoading: (v: boolean) => void
  patch: (p: Partial<VideoState>) => void
  hydrateFromSession: (s: VideoSessionResponse) => void
  startNewSession: () => Promise<void>
  setRegens: (m: Record<string, number>) => void
}

export const useVideoStore = create<VideoState & VideoActions>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setLoading: (v) => set({ isLoading: v }),
  // Un solo `patch`: los pasos de esta tool escriben campos distintos según la línea,
  // así que un setter por combinación sería puro boilerplate.
  patch: (p) => set(p),

  hydrateFromSession: (s) => {
    if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, s.id)
    set({
      sessionId: s.id,
      step: s.step,
      referenceVideoUrl: s.reference_video_url,
      forensicAnalysis: s.forensic_analysis,
      productUrl: s.product_url,
      productScan: s.product_scan,
      characterUrl: s.character_url,
      inputs: {
        productName: s.product_name ?? '',
        productDescription: s.what_it_does ?? '',
        angle: s.angle ?? '',
        targetAudience: s.target_audience ?? '',
        problem: s.problem ?? '',
        characterDesc: s.character_desc ?? '',
        characterEthnicity: s.character_ethnicity ?? '',
        accent: s.accent ?? '',
        voice: s.voice ?? '',
        constraints: s.constraints ?? '',
        // Solo para que `inputs` refleje lo persistido; el submit real de
        // Section2Character lo toma del `characterUrl` de nivel superior (recién
        // subido puede ir más adelantado que lo que ya hidrató la sesión).
        characterUrl: s.character_url ?? undefined,
        /**
         * ⚠️ SIN ESTO SE PERDÍAN LOS PERSONAJES 2-4 AL VOLVER ATRÁS.
         *
         * `hydrateFromSession` armaba `inputs` campo por campo y omitía la lista, así
         * que al reanudar una sesión `inputs.personajes` quedaba vacío y
         * `Section2Character` caía a su fallback de UNO solo (armado con las columnas
         * singulares). El riel deja volver a un paso ya alcanzado, así que bastaba
         * entrar a "Personaje" y darle a Continuar: `POST /inputs` mapea sobre lo que
         * le manda el wizard —correcto, porque ahí es donde se BORRA un personaje— y
         * los que no viajaban desaparecían de la fila. Con ellos se iban sus avatares
         * ya generados (dinero de Nano Banana Pro), la FASE 0 dejaba de bloquear por
         * su etnia y acento, y el render salía con una persona.
         *
         * Se toma la columna cruda y no `personajesDe`: ese accesor SINTETIZA un
         * personaje desde las columnas singulares cuando la lista es null, y meter ese
         * sintético acá haría que una sesión de un personaje empezara a escribir la
         * columna `personajes` solo por haberla abierto — justo lo que el camino
         * legado evita. Null se mantiene null y el fallback de la sección decide.
         */
        personajes: s.personajes ?? undefined,
      },
      validation: s.validation,
      template: s.template,
      adapted: s.adapted,
      consistencyBlock: s.consistency_block,
      voiceProfile: s.voice_profile,
      lotes: s.lotes,
      sessionError: false,
    })
  },

  setRegens: (regens) => set({ regens }),

  startNewSession: async () => {
    set({ ...initialState })
    try {
      const res = await fetch('/api/generador-video-ads/sessions', { method: 'POST' })
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
