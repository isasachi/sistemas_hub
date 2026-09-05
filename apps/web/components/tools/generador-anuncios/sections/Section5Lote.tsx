'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Download, AlertCircle } from 'lucide-react'
import { useWizardStore } from '@/store/wizard'
import type { AdVariant } from '@/lib/types'

const btnPrimary = 'h-11 w-full rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

/**
 * El lote renderizado — paso 5 del flujo de plantilla.
 *
 * ⚠️ LAS VARIANTES LLEGAN DE A UNA POR EL STREAM y el servidor persiste cada una en cuanto
 * termina. Por eso "reintentar" no es un botón de emergencia sino el camino normal: si el stream
 * se corta a mitad, lo que ya se pagó está guardado y volver a llamar solo re-renderiza las que
 * faltan.
 */
export default function Section5Lote() {
  const { sessionId, variants, patchVariant, setVariants } = useWizardStore()
  const [corriendo, setCorriendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listas = (variants ?? []).filter((v) => v.estado === 'lista')
  const pendientes = (variants ?? []).filter((v) => v.estado !== 'lista')

  async function generar() {
    if (!sessionId || corriendo) return
    setCorriendo(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-anuncios/sessions/${sessionId}/render-lote`, { method: 'POST' })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'No se pudo generar el lote')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const trozos = buffer.split('\n\n')
        buffer = trozos.pop() ?? ''
        for (const trozo of trozos) {
          if (!trozo.startsWith('data: ')) continue
          const ev = JSON.parse(trozo.slice(6)) as
            | { status: 'variant'; variant: AdVariant }
            | { status: 'done'; variants: AdVariant[] }
            | { status: 'error'; message: string }
          if (ev.status === 'variant') patchVariant(ev.variant)
          else if (ev.status === 'done') setVariants(ev.variants)
          else if (ev.status === 'error') setError(ev.message)
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCorriendo(false)
    }
  }

  // Nunca null: una pantalla en blanco se lee como una tool rota (ver el mismo guard en
  // `Section4Conceptos`).
  if (!variants || variants.length === 0)
    return <p className="text-[12px] text-[#c9b4ae]">Todavía no hay un lote planificado. Vuelve al paso anterior.</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {variants.map((v, i) => (
          <div key={v.id} className="flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#14050a]">
            <div className="relative aspect-[4/5] w-full bg-white/[0.03]">
              {v.imageUrl ? (
                <Image src={v.imageUrl} alt={v.concepto} fill unoptimized className="object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center">
                  {v.estado === 'generando' && (
                    <>
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      <span className="text-[10px] text-[#c9b4ae]">Generando…</span>
                    </>
                  )}
                  {v.estado === 'planificada' && <span className="text-[10px] text-[#8a7a76]">En cola</span>}
                  {v.estado === 'fallida' && (
                    <>
                      <AlertCircle size={16} className="text-red-400" />
                      <span className="text-[10px] leading-snug text-red-400">{v.error ?? 'Falló'}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate text-[11px] text-[#F6F2EB]">
                {i + 1}. {v.concepto}
              </span>
              {v.imageUrl && (
                // El bucket es cross-origin, así que el atributo `download` a secas lo ignora el
                // browser y abriría el PNG en otra pestaña: el query param hace que Supabase
                // responda `content-disposition: attachment`.
                <a
                  href={`${v.imageUrl}${v.imageUrl.includes('?') ? '&' : '?'}download=anuncio-${i + 1}.png`}
                  className="shrink-0 text-[#E8467A] hover:text-white transition-colors"
                  title="Descargar"
                >
                  <Download size={14} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      {pendientes.length > 0 && (
        <button onClick={generar} disabled={corriendo} className={btnPrimary}>
          {corriendo
            ? `Generando ${pendientes.length}…`
            : listas.length > 0
              ? `Reintentar los ${pendientes.length} que faltan`
              : `Generar ${pendientes.length === 1 ? 'el anuncio' : `los ${pendientes.length} anuncios`}`}
        </button>
      )}

      {pendientes.length === 0 && (
        <p className="text-center text-[12px] text-[#c9b4ae]">
          Listo: {listas.length} {listas.length === 1 ? 'anuncio' : 'anuncios'}. Descárgalos con el ícono de cada tarjeta.
        </p>
      )}
    </div>
  )
}
