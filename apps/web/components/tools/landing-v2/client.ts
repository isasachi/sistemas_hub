'use client'

// Capa de datos del front de landing v2. El front NO habla con modelos: solo con /api/landing-v2.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { UIMessage } from 'ai'
import type { LandingSession } from '@/lib/landing-v2/schemas'

export type View = LandingSession['view']
export const VIEW_KEY = 'landing_v2_view'
export const sessionKey = (v: View) => `landing_v2_session_${v}`

const API = '/api/landing-v2/sessions'

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Ocurrió un error. Inténtalo de nuevo.')
  return data as T
}

export const api = {
  create: (view: View) =>
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ view }) })
      .then((r) => json<{ session: LandingSession }>(r)),
  get: (id: string) => fetch(`${API}/${id}`).then((r) => json<{ session: LandingSession; messages: UIMessage[] }>(r)),
  patch: (id: string, body: object) =>
    fetch(`${API}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => json<{ session: LandingSession }>(r)),
  post: <T = { session: LandingSession }>(id: string, path: string, body: object = {}) =>
    fetch(`${API}/${id}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => json<T>(r)),
}

export type Uploaded = { url: string; kind: 'image' | 'document'; name: string }

/**
 * Baja la foto a ≤2048 px de lado largo en el navegador antes de subirla: el body de una función de
 * Vercel no pasa de 4,5 MB y una foto de celular sí. Si el navegador no puede decodificarla, va tal cual.
 */
export async function downscale(file: File, max = 2048): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (k === 1 && file.size < 3.5 * 1024 * 1024) return file
    const canvas = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k))
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    // PNG/WebP siguen en PNG: un mockup con transparencia pasado a JPEG sale con el fondo negro.
    const alpha = file.type === 'image/png' || file.type === 'image/webp'
    return await canvas.convertToBlob(alpha ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.9 })
  } catch {
    return file
  }
}

export async function uploadFile(sessionId: string, file: File, kind: Uploaded['kind']): Promise<Uploaded> {
  const form = new FormData()
  form.append('kind', kind)
  if (kind === 'image') {
    const blob = await downscale(file)
    form.append('file', new File([blob], file.name, { type: blob.type || file.type }))
  } else form.append('file', file)
  return json<Uploaded>(await fetch(`${API}/${sessionId}/upload`, { method: 'POST', body: form }))
}

export async function importImageUrl(sessionId: string, url: string): Promise<Uploaded> {
  return json<Uploaded>(await fetch(`${API}/${sessionId}/upload`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
  }))
}

/** La sesión v2 de una vista: se retoma por el id guardado y nace en el primer insumo real. */
export function useV2Session(view: View) {
  const [session, setSession] = useState<LandingSession | null>(null)
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [loading, setLoading] = useState(true)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    let saved: string | null = null
    try { saved = localStorage.getItem(sessionKey(view)) } catch { /* sin storage: sesión nueva */ }
    if (!saved) { setLoading(false); return }
    api.get(saved)
      .then((d) => { setSession(d.session); setMessages(d.messages) })
      .catch(() => { try { localStorage.removeItem(sessionKey(view)) } catch { /* nada */ } })
      .finally(() => setLoading(false))
  }, [view])

  const ensure = useCallback(async (): Promise<LandingSession> => {
    if (session) return session
    const { session: s } = await api.create(view)
    try { localStorage.setItem(sessionKey(view), s.id) } catch { /* la sesión vive igual en la base */ }
    setSession(s)
    return s
  }, [session, view])

  const reset = useCallback(() => {
    try { localStorage.removeItem(sessionKey(view)) } catch { /* nada */ }
    setSession(null)
    setMessages([])
  }, [view])

  return { session, setSession, messages, loading, ensure, reset }
}

/** ¿La sesión ya tiene algo que se perdería al cambiar de vista? */
export function hasProgress(view: View): boolean {
  try { return !!localStorage.getItem(sessionKey(view)) } catch { return false }
}
