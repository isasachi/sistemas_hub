'use client'

import { useEffect, useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import type { AdBatch } from '@/lib/types'
import { STEP } from '@/lib/anuncios/steps'

const TIKTOK_SCRIPT = `Busca en TikTok videos sobre el problema que resuelve tu producto.
Abre 2–3 videos con muchos comentarios.
Copia y pega aquí los comentarios tal como están — con errores, emojis y todo.

De ahí salen los ángulos: cada anuncio del lote ataca una preocupación distinta de las que aparecen en esos comentarios. Cuantos más pegues, más se diferencian entre sí.`

const btnPrimary = 'h-11 w-full rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

/**
 * Comentarios + cuántos anuncios — paso 3 del flujo de plantilla.
 *
 * ⚠️ EL SELECTOR DE CANTIDAD SALE DEL SERVIDOR, no de una lista escrita acá. `opciones` ya viene
 * recortada por el cap del plan Y por los créditos que quedan: pintar `[1][3][5][10]` a mano
 * ofrecería un lote que el servidor no va a servir, que es exactamente cómo el paywall termina
 * prometiendo lo que no entrega.
 */
export default function Section3Lote() {
  const { sessionId, setVariants, setStep, setLoading, isLoading } = useWizardStore()
  const [comments, setComments] = useState('')
  const [n, setN] = useState<number | null>(null)
  const [opciones, setOpciones] = useState<number[]>([])
  const [restantes, setRestantes] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recorte, setRecorte] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/generador-anuncios/plantillas')
      .then((r) => r.json() as Promise<{ opciones: number[]; credits: { restantes: number } | null }>)
      .then((d) => {
        setOpciones(d.opciones)
        setRestantes(d.credits?.restantes ?? null)
        // Por defecto el máximo que puede pedir: es un lote, y pedir uno solo desaprovecha
        // justamente lo que este flujo hace distinto.
        setN(d.opciones.at(-1) ?? null)
      })
      .catch(() => setOpciones([1]))
  }, [])

  async function handleSubmit() {
    if (!sessionId || !comments.trim() || !n || isLoading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-anuncios/sessions/${sessionId}/plan-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments, n }),
      })
      const data = await res.json() as {
        variants?: AdBatch; error?: string; pedido?: number; servido?: number; maximo?: number
      }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo planificar el lote')
      // ⚠️ SI SE SIRVIERON MENOS DE LOS PEDIDOS, HAY QUE DECIRLO Y NO PASAR DE LARGO. El cap lo
      // aplica el SERVIDOR (plan + créditos) y una variante que no se pudo redactar se descarta,
      // así que el usuario puede elegir 5 y recibir 3 sin ninguna señal. Cuando eso pasa el lote
      // se guarda igual pero el wizard se queda acá con el aviso: avanzar solo lo dejaría contando
      // tarjetas para descubrirlo.
      const servido = data.servido ?? data.variants!.length
      const pedido = data.pedido ?? servido
      const aviso =
        servido >= pedido
          ? null
          : data.maximo !== undefined && pedido > data.maximo
            ? `Pediste ${pedido}, pero tu plan y tus créditos permiten ${data.maximo} por lote: se planificaron ${servido}.`
            : `Se planificaron ${servido} de ${pedido}: alguna variante no se pudo redactar.`
      setRecorte(aviso)
      setVariants(data.variants!, aviso ? undefined : STEP.CONCEPTOS)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/[0.06] bg-[#14050a] px-4 py-4">
        <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-[#c9b4ae]">{TIKTOK_SCRIPT}</pre>
      </div>

      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        rows={7}
        placeholder="Pega aquí los comentarios..."
        className="jr-field resize-none rounded-xl px-4 py-3 text-[13px]"
      />

      <div className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-wider text-[#c9b4ae]">¿Cuántos anuncios?</span>
        <div className="flex flex-wrap gap-2">
          {opciones.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setN(o)}
              className={`h-10 min-w-[52px] rounded-xl border px-4 text-[13px] font-bold transition-all duration-200 cursor-pointer ${
                n === o ? 'border-[#E8467A] bg-[#BD1347] text-white' : 'border-white/[0.06] bg-[#14050a] text-[#F6F2EB] hover:border-white/20'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
        {/* ⚠️ El costo se dice ANTES de disparar. Cada anuncio del lote gasta un crédito, y en el
            plan más chico un lote es una fracción visible del mes. */}
        <span className="text-[11px] text-[#8a7a76]">
          {n === 1 ? 'Gasta 1 crédito de imagen' : `Gastan ${n} créditos de imagen`}
          {restantes !== null && ` · te quedan ${restantes}`}
          {'. Planificar el texto es gratis: los créditos se cobran al generar las imágenes.'}
        </span>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-[#c9b4ae]">Diseñando {n} conceptos distintos…</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-brand-gradient" />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      {recorte && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <span className="text-[12px] leading-snug text-amber-300">{recorte}</span>
          <button onClick={() => setStep(STEP.CONCEPTOS)} className={btnPrimary}>Ver los conceptos →</button>
        </div>
      )}

      <button onClick={handleSubmit} disabled={!comments.trim() || !n || isLoading} className={btnPrimary}>
        {isLoading ? 'Planificando…' : 'Planificar el lote →'}
      </button>
    </div>
  )
}
