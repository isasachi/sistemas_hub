'use client'

// Vista Chat: el mismo núcleo y la misma sesión que el wizard, manejados por lenguaje natural. El
// agente vive en el servidor (`lib/anuncios/agent.ts`); acá solo se muestran mensajes, copy e imágenes.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { ArrowLeft, ArrowUp, Paperclip, RotateCcw, X } from 'lucide-react'
import type { AnunciosUIMessage } from '@/lib/anuncios/agent'
import type { SessionResponse } from '@/lib/types'
import { SESSION_KEY, useWizardStore } from '@/store/wizard'

const API = '/api/generador-anuncios/sessions'
const ADJ = /^\[Adjunto imagen: (.+?) — (https:\/\/\S+)\]$/
type Uploaded = { url: string; name: string }

const Spinner = () => <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-[#e8467a]" />

/**
 * Baja la foto a ≤2048 px de lado largo en el navegador antes de subirla: el body de una función de
 * Vercel no pasa de 4,5 MB y una foto de celular sí. Si el navegador no puede decodificarla, va tal cual.
 */
async function downscale(file: File, max = 2048): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (k === 1 && file.size < 3.5 * 1024 * 1024) return file
    const canvas = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k))
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    // PNG/WebP siguen en PNG: un logo con transparencia pasado a JPEG sale con el fondo negro.
    const alpha = file.type === 'image/png' || file.type === 'image/webp'
    return await canvas.convertToBlob(alpha ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.9 })
  } catch {
    return file
  }
}

async function upload(sessionId: string, file: File): Promise<Uploaded> {
  const blob = await downscale(file)
  const form = new FormData()
  form.append('file', new File([blob], file.name, { type: blob.type || file.type }))
  const res = await fetch(`${API}/${sessionId}/upload`, { method: 'POST', body: form })
  const data = await res.json().catch(() => ({})) as Partial<Uploaded> & { error?: string }
  if (!res.ok || !data.url) throw new Error(data.error ?? 'No se pudo subir la imagen.')
  return { url: data.url, name: data.name ?? file.name }
}

export default function AdChat({ switcher }: { switcher: React.ReactNode }) {
  const { hydrateFromSession, resetSession } = useWizardStore()
  // null = todavía leyendo la sesión guardada. La conversación se monta UNA vez, con su historial.
  const [initial, setInitial] = useState<AnunciosUIMessage[] | null>(null)
  // Remonta la conversación SOLO al pedir una nueva: la sesión nace con el primer mensaje y remontar
  // ahí cortaría el stream en curso.
  const [epoch, setEpoch] = useState(0)
  const arrancado = useRef(false)

  useEffect(() => {
    if (arrancado.current) return
    arrancado.current = true
    let saved: string | null = null
    try { saved = localStorage.getItem(SESSION_KEY) } catch { /* sin storage: sesión nueva */ }
    if (!saved) { resetSession(); setInitial([]); return }
    fetch(`${API}/${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<SessionResponse>) : Promise.reject()))
      .then((s) => { hydrateFromSession(s); setInitial((s.messages ?? []) as AnunciosUIMessage[]) })
      // Un id muerto o ajeno no crea nada: se borra y la sesión nace con el primer mensaje.
      .catch(() => { try { localStorage.removeItem(SESSION_KEY) } catch { /* nada */ } resetSession(); setInitial([]) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function nuevo() {
    try { localStorage.removeItem(SESSION_KEY) } catch { /* nada */ }
    resetSession()
    setInitial([])
    setEpoch((n) => n + 1)
  }

  return (
    // Alto exacto bajo la barra del hub (64px + borde, ver AppShell): la conversación scrollea por
    // dentro y el input queda fijo abajo sin que la página entera se mueva.
    <div className="flex h-[calc(100dvh-65px)] flex-col bg-[#0c0c0d]">
      <header className="shrink-0 border-b border-white/[0.06] bg-[#0c0c0d]">
        <div className="mx-auto flex h-[60px] w-full max-w-[1160px] items-center gap-3 px-5 md:px-8">
          <Link href="/tools/generador-anuncios" className="jr-btn-ghost h-9 shrink-0 rounded-xl px-3 text-[13px] no-underline">
            <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Atrás</span>
          </Link>
          <p className="truncate font-sans text-[14px] font-semibold text-[#efe7e0]">Generador de Anuncios</p>
          <div className="ml-auto flex items-center gap-2">
            {switcher}
            <button type="button" onClick={nuevo}
                    className="flex items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 py-1 font-sans text-[12px] font-medium text-[#a98c88] hover:text-[#f6f2eb] cursor-pointer">
              <RotateCcw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Nuevo</span>
            </button>
          </div>
        </div>
      </header>
      {initial === null
        ? <div className="flex flex-1 items-center justify-center"><Spinner /></div>
        : <Conversation key={epoch} initial={initial} />}
    </div>
  )
}

function Conversation({ initial }: { initial: AnunciosUIMessage[] }) {
  const ensureSession = useWizardStore((s) => s.ensureSession)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState<(Uploaded | { uploading: string })[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottom = useRef<HTMLDivElement>(null)

  const transport = useMemo(() => new DefaultChatTransport<AnunciosUIMessage>({
    api: `${API}/_/chat`,
    // El servidor guarda el historial: se manda solo el mensaje nuevo. La fila nace acá si no existía.
    prepareSendMessagesRequest: async ({ messages }) => {
      const id = await ensureSession()
      if (!id) throw new Error('No se pudo crear la sesión. Inténtalo de nuevo.')
      return { api: `${API}/${id}/chat`, body: { message: messages[messages.length - 1] } }
    },
  }), [ensureSession])

  const { messages, sendMessage, status, error, regenerate } = useChat<AnunciosUIMessage>({
    messages: initial,
    transport,
    onFinish: () => bottom.current?.scrollIntoView({ behavior: 'smooth' }),
  })
  const busy = status === 'submitted' || status === 'streaming'
  const uploading = pending.some((p) => 'uploading' in p)

  async function attach(files: File[]) {
    setUploadError(null)
    const id = await ensureSession()
    if (!id) { setUploadError('No se pudo crear la sesión. Inténtalo de nuevo.'); return }
    for (const f of files) {
      setPending((p) => [...p, { uploading: f.name }])
      try {
        const up = await upload(id, f)
        setPending((p) => p.map((x) => ('uploading' in x && x.uploading === f.name ? up : x)))
      } catch (e) {
        setUploadError((e as Error).message)
        setPending((p) => p.filter((x) => !('uploading' in x && x.uploading === f.name)))
      }
    }
  }

  function send(texto = input) {
    const ready = pending.filter((p): p is Uploaded => 'url' in p)
    const text = [texto.trim(), ...ready.map((a) => `[Adjunto imagen: ${a.name} — ${a.url}]`)].filter(Boolean).join('\n')
    if (!text || busy || uploading) return
    sendMessage({ text })
    setInput(''); setPending([])
    setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const bar = (
    <div className="w-full rounded-2xl border border-white/[0.1] bg-[#160a0f] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2 pt-1 pb-2">
          {pending.map((p, k) => (
            <span key={k} className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2 py-1 text-[12px] text-[#efe7e0]">
              {'uploading' in p ? <><Spinner />{p.uploading}</> : <><img src={p.url} alt="" className="h-6 w-6 rounded object-cover" />{p.name}
                <button type="button" aria-label="Quitar adjunto" onClick={() => setPending((x) => x.filter((_, j) => j !== k))} className="border-0 bg-transparent p-0 text-[#a98c88] cursor-pointer"><X className="h-3 w-3" /></button></>}
            </span>
          ))}
        </div>
      )}
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} aria-label="Mensaje"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Adjunta el anuncio que quieres emular y cuéntame de tu producto…"
                className="max-h-48 min-h-[52px] w-full resize-none border-0 bg-transparent px-2 py-1.5 font-[Lato] text-[15px] text-[#f6f2eb] outline-none placeholder:text-[#a98c88]" />
      <div className="flex items-center gap-2 px-1">
        <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => {
          // Copia ANTES de limpiar: la FileList es viva y `value = ''` la vacía antes de que `attach` la lea.
          const files = Array.from(e.target.files ?? []); e.target.value = ''
          if (files.length) attach(files)
        }} />
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Adjuntar imagen"
                className="flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-[#c9b4ae] hover:bg-white/[0.06] cursor-pointer"><Paperclip className="h-4 w-4" /></button>
        <div className="flex-1" />
        <button type="button" onClick={() => send()} disabled={busy || uploading || (!input.trim() && !pending.length)} aria-label="Enviar"
                className="jr-cta flex h-9 w-9 items-center justify-center rounded-lg border-0 disabled:opacity-40 cursor-pointer"><ArrowUp className="h-4 w-4" /></button>
      </div>
    </div>
  )

  if (!messages.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-[10vh]">
        <div className="flex max-w-[640px] flex-col items-center gap-2 text-center">
          <h1 className="lp-serif text-[clamp(26px,3.4vw,34px)] leading-[1.15] text-[#f6f2eb]">¿Qué anuncio creamos hoy?</h1>
          <p className="font-[Lato] text-[15px] text-[#c9b4ae]">Adjunta un anuncio que te guste y la foto de tu producto. Cuéntame cómo se llama, qué es, qué hace y a quién le hablas: con eso escribo el copy y armo el anuncio.</p>
        </div>
        <div className="w-full max-w-[720px]">{bar}</div>
        {uploadError && <p role="alert" className="text-[12px] text-red-400">{uploadError}</p>}
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-8">
          {messages.map((m, i) => <Message key={m.id} m={m} onPick={!busy && i === messages.length - 1 ? (v) => send(`Me quedo con la versión ${v}`) : undefined} />)}
          {status === 'submitted' && <p className="flex items-center gap-2 text-[13px] text-[#a98c88]" aria-live="polite"><Spinner /> Pensando…</p>}
          {error && (
            <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              <span className="flex-1">No pude completar la respuesta. {error.message.startsWith('{') ? '' : error.message}</span>
              <button type="button" onClick={() => regenerate()} className="jr-btn-ghost h-8 rounded-lg px-3 text-[12px] cursor-pointer">Reintentar</button>
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-[#0c0c0d] px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-[760px]">
          {uploadError && <p role="alert" className="pb-2 text-[12px] text-red-400">{uploadError}</p>}
          {bar}
        </div>
      </div>
    </>
  )
}

const RUNNING: Record<string, string> = {
  'tool-set_reference': 'Leyendo el anuncio de referencia…',
  'tool-set_product': 'Analizando tu producto e investigando tu mercado…',
  'tool-write_copy': 'Escribiendo el copy…',
  'tool-generate_ad': 'Generando tu anuncio… suele tardar alrededor de un minuto.',
  'tool-adjust_ad': 'Aplicando tus cambios… suele tardar alrededor de un minuto.',
}

// El modelo responde con **negritas** de markdown. Solo eso se interpreta: un renderer de markdown
// entero es una dependencia para un asterisco.
const bold = (t: string) => t.split(/\*\*(.+?)\*\*/g).map((x, i) => (i % 2 ? <strong key={i} className="font-semibold text-[#f6f2eb]">{x}</strong> : x))

type CopyLine = { element: string; text: string }

function CopyCard({ label, lines, onPick }: { label: string; lines: CopyLine[]; onPick?: () => void }) {
  return (
    <div className="flex-1 min-w-[240px] rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <p className="border-b border-white/[0.05] px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-[#a98c88]">{label}</p>
      <div className="divide-y divide-white/[0.04] px-4">
        {lines.map((l, k) => (
          <div key={k} className="flex items-start gap-3 py-2.5">
            <span className="mt-0.5 w-16 shrink-0 text-[9px] font-bold uppercase tracking-wider text-[#a98c88]">{l.element}</span>
            <span className="text-[12px] leading-relaxed text-[#efe7e0]">&ldquo;{l.text}&rdquo;</span>
          </div>
        ))}
      </div>
      {onPick && (
        <div className="px-4 pb-3 pt-1">
          <button type="button" onClick={onPick} className="jr-btn-ghost h-8 w-full rounded-lg text-[12px] cursor-pointer">Elegir {label.toLowerCase()}</button>
        </div>
      )}
    </div>
  )
}

function Message({ m, onPick }: { m: AnunciosUIMessage; onPick?: (v: 'A' | 'B') => void }) {
  if (m.role === 'user') {
    const lines = m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n').split('\n')
    const adj = lines.map((l) => l.match(ADJ)).filter(Boolean) as RegExpMatchArray[]
    const body = lines.filter((l) => !ADJ.test(l)).join('\n').trim()
    return (
      <div className="flex flex-col items-end gap-2">
        {adj.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {adj.map((a, k) => <img key={k} src={a[2]} alt={a[1]} className="h-28 rounded-xl object-cover" />)}
          </div>
        )}
        {body && <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[rgba(246,242,235,0.1)] px-4 py-2.5 font-[Lato] text-[15px] text-[#f6f2eb]">{body}</p>}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {m.parts.map((p, k) => {
        if (p.type === 'text') return p.text.trim() ? <p key={k} className="whitespace-pre-wrap font-[Lato] text-[15px] leading-[1.65] text-[#efe7e0]">{bold(p.text)}</p> : null
        if (!p.type.startsWith('tool-') || !('state' in p)) return null
        if (p.state === 'input-streaming' || p.state === 'input-available') {
          return RUNNING[p.type] ? <p key={k} className="flex items-center gap-2 text-[13px] text-[#a98c88]" aria-live="polite"><Spinner />{RUNNING[p.type]}</p> : null
        }
        if (p.state !== 'output-available') return null
        const out = p.output as { ok?: boolean; imageUrl?: string; versionA?: CopyLine[]; versionB?: CopyLine[] }
        if (!out.ok) return null
        // El copy lo dibuja la interfaz desde el resultado de la tool, no el modelo: lo que el
        // usuario elige es exactamente lo que se guardó.
        if (p.type === 'tool-write_copy' && out.versionA && out.versionB) {
          return (
            <div key={k} className="flex flex-wrap gap-3">
              <CopyCard label="Versión A" lines={out.versionA} onPick={onPick && (() => onPick('A'))} />
              <CopyCard label="Versión B" lines={out.versionB} onPick={onPick && (() => onPick('B'))} />
            </div>
          )
        }
        if ((p.type === 'tool-generate_ad' || p.type === 'tool-adjust_ad') && out.imageUrl) {
          return (
            <a key={k} href={out.imageUrl} target="_blank" rel="noreferrer" className="block w-full max-w-[340px]">
              <img src={out.imageUrl} alt="Anuncio generado" className="w-full rounded-2xl border border-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,.6)]" />
            </a>
          )
        }
        return null
      })}
    </div>
  )
}
