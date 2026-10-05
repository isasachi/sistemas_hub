'use client'

// Vista B — Chat: el mismo núcleo que el wizard, manejado por lenguaje natural. El agente vive en el
// servidor (`lib/landing-v2/agent.ts`); acá solo se muestran los mensajes y las imágenes.
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { ArrowLeft, ArrowUp, FileText, Paperclip, RotateCcw, X } from 'lucide-react'
import type { LandingUIMessage } from '@/lib/landing-v2/agent'
import type { SectionId } from '@/lib/landing-v2/catalog'
import { uploadFile, useV2Session, type Uploaded } from './client'
import { SectionImage } from './SectionImage'
import { Spinner } from './WizardV2'

const ACCEPT = 'image/*,.pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ADJ = /^\[Adjunto (imagen|documento): (.+?) — (https:\/\/\S+)\]$/

export default function ChatV2({ switcher }: { switcher: React.ReactNode }) {
  const v2 = useV2Session('chat')
  // Remonta la conversación SOLO al pedir una nueva: la sesión nace con el primer mensaje y remontar
  // ahí cortaría el stream en curso.
  const [epoch, setEpoch] = useState(0)
  return (
    // Alto exacto bajo la barra del hub (64px + borde, ver AppShell): la conversación scrollea por
    // dentro y el input queda fijo abajo sin que la página entera se mueva.
    <div className="flex h-[calc(100dvh-65px)] flex-col bg-[#0c0c0d]">
      <header className="shrink-0 border-b border-white/[0.06] bg-[#0c0c0d]">
        <div className="mx-auto flex h-[60px] w-full max-w-[1160px] items-center gap-3 px-5 md:px-8">
          <Link href="/tools/generador-landing" className="jr-btn-ghost h-9 shrink-0 rounded-xl px-3 text-[13px] no-underline">
            <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Atrás</span>
          </Link>
          <p className="truncate font-sans text-[14px] font-semibold text-[#efe7e0]">Generador de Landing</p>
          <div className="ml-auto flex items-center gap-2">
            {switcher}
            <button type="button" onClick={() => { v2.reset(); setEpoch((n) => n + 1) }}
                    className="flex items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 py-1 font-sans text-[12px] font-medium text-[#a98c88] hover:text-[#f6f2eb] cursor-pointer">
              <RotateCcw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Nuevo</span>
            </button>
          </div>
        </div>
      </header>
      {v2.loading
        ? <div className="flex flex-1 items-center justify-center"><Spinner /></div>
        : <Conversation key={epoch} v2={v2} />}
    </div>
  )
}

function Conversation({ v2 }: { v2: ReturnType<typeof useV2Session> }) {
  const sessionRef = useRef(v2.session)
  sessionRef.current = v2.session
  const [input, setInput] = useState('')
  const [pending, setPending] = useState<(Uploaded | { uploading: string })[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottom = useRef<HTMLDivElement>(null)

  const transport = useMemo(() => new DefaultChatTransport<LandingUIMessage>({
    api: '/api/landing-v2/sessions/_/chat',
    // El servidor guarda el historial: se manda solo el mensaje nuevo, a la sesión de esta vista.
    prepareSendMessagesRequest: async ({ messages }) => {
      const s = sessionRef.current ?? await v2.ensure()
      return { api: `/api/landing-v2/sessions/${s.id}/chat`, body: { message: messages[messages.length - 1] } }
    },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  const { messages, sendMessage, status, error, regenerate } = useChat<LandingUIMessage>({
    messages: v2.messages as LandingUIMessage[],
    transport,
    onFinish: () => bottom.current?.scrollIntoView({ behavior: 'smooth' }),
  })
  const busy = status === 'submitted' || status === 'streaming'
  const uploading = pending.some((p) => 'uploading' in p)

  async function attach(files: FileList) {
    setUploadError(null)
    const s = await v2.ensure()
    for (const f of Array.from(files)) {
      const kind = f.type.startsWith('image/') ? 'image' : 'document'
      setPending((p) => [...p, { uploading: f.name }])
      try {
        const up = await uploadFile(s.id, f, kind)
        setPending((p) => p.map((x) => ('uploading' in x && x.uploading === f.name ? up : x)))
      } catch (e) {
        setUploadError((e as Error).message)
        setPending((p) => p.filter((x) => !('uploading' in x && x.uploading === f.name)))
      }
    }
  }

  function send() {
    const ready = pending.filter((p): p is Uploaded => 'url' in p)
    const lines = ready.map((a) => `[Adjunto ${a.kind === 'image' ? 'imagen' : 'documento'}: ${a.name} — ${a.url}]`)
    const text = [input.trim(), ...lines].filter(Boolean).join('\n')
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
              {'uploading' in p ? <><Spinner />{p.uploading}</> : <>{p.kind === 'image' ? <img src={p.url} alt="" className="h-6 w-6 rounded object-cover" /> : <FileText className="h-3.5 w-3.5" />}{p.name}
                <button type="button" aria-label="Quitar adjunto" onClick={() => setPending((x) => x.filter((_, j) => j !== k))} className="border-0 bg-transparent p-0 text-[#a98c88] cursor-pointer"><X className="h-3 w-3" /></button></>}
            </span>
          ))}
        </div>
      )}
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} aria-label="Mensaje"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Cuéntame tu producto: nombre, investigación, precios, nicho… y adjunta la imagen."
                className="max-h-48 min-h-[52px] w-full resize-none border-0 bg-transparent px-2 py-1.5 font-[Lato] text-[15px] text-[#f6f2eb] outline-none placeholder:text-[#a98c88]" />
      <div className="flex items-center gap-2 px-1">
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { if (e.target.files?.length) attach(e.target.files); e.target.value = '' }} />
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Adjuntar imagen, PDF o Word"
                className="flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-[#c9b4ae] hover:bg-white/[0.06] cursor-pointer"><Paperclip className="h-4 w-4" /></button>
        {/* Slot reservado para opciones de la barra que se definirán más adelante. */}
        <div data-slot="input-options" className="flex min-w-0 flex-1 items-center gap-2" />
        <button type="button" onClick={send} disabled={busy || uploading || (!input.trim() && !pending.length)} aria-label="Enviar"
                className="jr-cta flex h-9 w-9 items-center justify-center rounded-lg border-0 disabled:opacity-40 cursor-pointer"><ArrowUp className="h-4 w-4" /></button>
      </div>
    </div>
  )

  if (!messages.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-[10vh]">
        <div className="flex max-w-[640px] flex-col items-center gap-2 text-center">
          <h1 className="lp-serif text-[clamp(26px,3.4vw,34px)] leading-[1.15] text-[#f6f2eb]">¿Qué landing creamos hoy?</h1>
          <p className="font-[Lato] text-[15px] text-[#c9b4ae]">Necesito el nombre exacto del producto, tu investigación de mercado, precios y packs, el nicho y una imagen del producto. Con eso empiezo por el Hero.</p>
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
          {messages.map((m) => <Message key={m.id} m={m} />)}
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
  'tool-generate_section': 'Diseñando la sección… suele tardar alrededor de un minuto.',
  'tool-revise_section': 'Aplicando tus cambios…',
  'tool-analyze_product': 'Analizando tu producto y tu marca…',
  'tool-extract_research_document': 'Leyendo el documento…',
}

// El modelo responde con **negritas** de markdown (medido en el probe del agente). Solo eso se
// interpreta: un renderer de markdown entero es una dependencia para un asterisco.
const bold = (t: string) => t.split(/\*\*(.+?)\*\*/g).map((x, i) => (i % 2 ? <strong key={i} className="font-semibold text-[#f6f2eb]">{x}</strong> : x))

function Message({ m }: { m: LandingUIMessage }) {
  if (m.role === 'user') {
    const text = m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
    const lines = text.split('\n')
    const adj = lines.map((l) => l.match(ADJ)).filter(Boolean) as RegExpMatchArray[]
    const body = lines.filter((l) => !ADJ.test(l)).join('\n').trim()
    return (
      <div className="flex flex-col items-end gap-2">
        {adj.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {adj.map((a, k) => a[1] === 'imagen'
              ? <img key={k} src={a[3]} alt={a[2]} className="h-28 rounded-xl object-cover" />
              : <span key={k} className="flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-2 text-[12px] text-[#efe7e0]"><FileText className="h-4 w-4" />{a[2]}</span>)}
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
        if (p.state === 'output-available' && (p.type === 'tool-generate_section' || p.type === 'tool-revise_section')) {
          const out = p.output as { ok: boolean; section?: SectionId; imageUrl?: string }
          return out.ok && out.section && out.imageUrl
            ? <SectionImage key={k} id={out.section} url={out.imageUrl} className="w-full max-w-[340px]" />
            : null
        }
        return null
      })}
    </div>
  )
}
