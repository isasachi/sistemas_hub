'use client'

import { create } from 'zustand'
import type {
  VideoMode, ForensicAnalysis, CharacterBrief, ProductScan,
  ScriptTemplate, ScriptVersions, VideoDirection, ConfirmedScript, VideoSessionResponse,
} from '@/lib/video-ads/types'

export const SESSION_KEY = 'video_ads_session_id'

interface VideoState {
  sessionId: string | null
  sessionError: boolean
  step: number
  isLoading: boolean
  mode: VideoMode | null
  referenceVideoUrl: string | null
  forensicAnalysis: ForensicAnalysis | null
  characterBrief: CharacterBrief | null
  characterUrl: string | null
  productUrl: string | null
  productScan: ProductScan | null
  productName: string | null
  whatItDoes: string | null
  targetAudience: string | null
  scriptTemplate: ScriptTemplate | null
  scriptVersions: ScriptVersions | null
  direction: VideoDirection | null
  confirmedScript: ConfirmedScript | null
  duration: number | null
  videoUrl: string | null
  videoStatus: string | null
  regens: Record<string, number>
}

const initialState: VideoState = {
  sessionId: null,
  sessionError: false,
  step: 0,
  isLoading: false,
  mode: null,
  referenceVideoUrl: null,
  forensicAnalysis: null,
  characterBrief: null,
  characterUrl: null,
  productUrl: null,
  productScan: null,
  productName: null,
  whatItDoes: null,
  targetAudience: null,
  scriptTemplate: null,
  scriptVersions: null,
  direction: null,
  confirmedScript: null,
  duration: null,
  videoUrl: null,
  videoStatus: null,
  regens: {},
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
      mode: s.mode,
      referenceVideoUrl: s.reference_video_url,
      forensicAnalysis: s.forensic_analysis,
      characterBrief: s.character_brief,
      characterUrl: s.character_url,
      productUrl: s.product_url,
      productScan: s.product_scan,
      productName: s.product_name,
      whatItDoes: s.what_it_does,
      targetAudience: s.target_audience,
      scriptTemplate: s.script_template,
      scriptVersions: s.script_versions,
      direction: s.direction,
      confirmedScript: s.confirmed_script,
      duration: s.duration,
      videoUrl: s.video_url,
      videoStatus: s.video_status,
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
