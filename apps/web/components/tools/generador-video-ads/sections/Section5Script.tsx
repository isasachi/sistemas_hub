'use client'

import { useState } from 'react'
import { useVideoStore } from '@/store/video'
import type { AdaptedScript } from '@/lib/video-ads/adapt'
import type { VoiceProfile } from '@/lib/video-ads/character'
import { STEP } from '@/lib/video-ads/steps'
import { extractPending } from '@/lib/video-ads/pending'
import { btnPrimary, btnGhost, errorBox, spinner } from './shared'

// FASE 3 en pantalla + FASE 4/4.5 encadenadas: el personaje y la voz se construyen
// acá porque el usuario ya no toca nada de eso — lo definió en el paso 2. Encadenar
// las dos llamadas en un solo botón evita un paso intermedio que no aporta decisión.
export default function Section5Script() {
  const { sessionId, adapted, consistencyBlock, patch, setLoading, isLoading } = useVideoStore()
  const [error, setError] = useState<string | null>(null)
  // Separado de `error` a propósito (fix round 6): si el guión SÍ se adaptó pero
  // construir el personaje falla, mezclar los dos mensajes en un solo `error` haría
  // parecer que nada se guardó — cuando en realidad el guión nuevo ya está en la base.
  const [characterError, setCharacterError] = useState<string | null>(null)
  // Ediciones del usuario sobre las locuciones, por POSICIÓN en `adapted.tomas` (no por
  // `toma.n`, que lo hereda el forense y puede repetirse). Solo las tomas que tocó
  // entran acá; el resto queda tal cual está guardado.
  const [ediciones, setEdiciones] = useState<Record<number, string>>({})
  const [guardando, setGuardando] = useState(false)

  async function run() {
    if (!sessionId) return
    setLoading(true); setError(null); setCharacterError(null); setEdiciones({})
    try {
      const a = await fetch(`/api/generador-video-ads/sessions/${sessionId}/adapt-script`, {
        method: 'POST',
      })
      const da = (await a.json()) as { adapted?: AdaptedScript; error?: string }
      if (!a.ok) throw new Error(da.error ?? 'No se pudo adaptar el guión')

      // Fix round 6: patchear el store apenas ESTA llamada confirma 200, no al final
      // de las dos. `adapt-script/route.ts` ya persistió `adapted` en la base antes
      // de responder — si el siguiente paso (construir el personaje) falla, la base
      // y el store NO pueden quedar contando dos versiones distintas del guión. El
      // render (`generate-lotes`) lee `session.adapted` de la BASE, no del store, así
      // que un store desactualizado no evita nada — solo le esconde al usuario que el
      // guión ya cambió. Sin este patch temprano, un "Reintentar" posterior en
      // Section6Lotes recalcula la huella sobre el guión NUEVO (el de la base) contra
      // lotes ya renderizados con la huella del guión VIEJO: deja de coincidir, y lo
      // que el usuario cree que es una reanudación gratis se convierte en silencio en
      // un re-render pagado que abandona los taskId ya pagados — justo lo contrario
      // de lo que promete la copia de "Reintentar" en Section6Lotes.
      patch({ adapted: da.adapted! })
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
      return
    }

    try {
      const c = await fetch(`/api/generador-video-ads/sessions/${sessionId}/character`, { method: 'POST' })
      const dc = (await c.json()) as { characterUrl?: string; consistencyBlock?: string; voiceProfile?: VoiceProfile; error?: string }
      if (!c.ok) throw new Error(dc.error ?? 'No se pudo construir el personaje')

      patch({
        characterUrl: dc.characterUrl!,
        consistencyBlock: dc.consistencyBlock!,
        voiceProfile: dc.voiceProfile!,
      })
    } catch (err) {
      setCharacterError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Guarda el texto editado. No llama a ningún modelo: reescribe las locuciones y
  // recalcula caracteres, diferencia y marcadores pendientes en el servidor.
  async function guardar() {
    if (!sessionId) return
    setGuardando(true); setError(null)
    try {
      const r = await fetch(`/api/generador-video-ads/sessions/${sessionId}/script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locuciones: Object.entries(ediciones).map(([indice, texto]) => ({ indice: Number(indice), texto })),
        }),
      })
      const d = (await r.json()) as { adapted?: AdaptedScript; error?: string }
      if (!r.ok) throw new Error(d.error ?? 'No se pudo guardar el guión')
      patch({ adapted: d.adapted! })
      setEdiciones({})
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (!adapted) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] leading-relaxed text-[#8b8b8b]">
          Rellenamos la plantilla con tu producto, ángulo y avatar — respetando frase por
          frase la estructura del original — y construimos la identidad visual y vocal del
          personaje, que se repetirá idéntica en todos los lotes.
        </p>
        {error && <div className={errorBox}>{error}</div>}
        <button onClick={() => run()} disabled={isLoading} className={btnPrimary}>
          {isLoading ? <><span className={spinner} />Adaptando el guión...</> : 'Adaptar el guión →'}
        </button>
      </div>
    )
  }

  // El texto que el usuario está viendo: lo guardado, pisado por lo que haya editado y
  // todavía no guardado.
  const lineas = adapted.tomas.map((t, i) => ({ ...t, i, texto: ediciones[i] ?? t.locucion }))
  const guionActual = lineas.map((l) => l.texto).join(' ')
  // Del TEXTO, no de `adapted.variablesPendientes`: el modelo no mantiene esa lista
  // sincronizada con los marcadores que deja (ver `extractPending`), y acá además el
  // usuario los está borrando a mano mientras escribe.
  const pendientes = extractPending(guionActual)
  const sucio = Object.keys(ediciones).length > 0
  // El largo del original no viaja al cliente, pero se despeja de lo que sí: la
  // diferencia guardada es `adaptado - original`, así que `adaptado - diferencia` es el
  // original. Permite mover el contador mientras se escribe, que es la métrica que pide
  // el spec ("Diferencia frente al original") y la razón por la que alguien edita.
  const caracteresOriginal = adapted.caracteresAdaptado - adapted.diferenciaCaracteres
  const diferencia = guionActual.length - caracteresOriginal

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-white/[0.06] bg-[#121214] px-4 py-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
          Guión final adaptado
        </div>
        {/* El spec de la FASE 3 dice "No preguntes nada": lo que no se puede completar
            con seguridad queda marcado en el guión y lo escribe el usuario. Antes había
            un formulario con un campo por variable pendiente — preguntaba justo lo que
            el spec prohíbe y, encima, no dejaba tocar el resto de la frase cuando el
            modelo elegía un valor que no concordaba ("un efecto iluminadora"). Editar la
            línea cubre los dos casos con un solo mecanismo. */}
        <p className="mb-3 text-[11.5px] leading-relaxed text-[#8b8b8b]">
          Una línea por toma, en el orden del original. Edítalas si algo no suena natural.
          Lo que quedó entre corchetes no lo inventamos: escríbelo tú.
        </p>

        <div className="flex flex-col gap-3">
          {lineas.map((l) => {
            const falta = l.texto.includes('[PENDIENTE:')
            return (
              <div key={l.i} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] text-[#8b8b8b]">
                  <span>Toma {l.n} · {l.duracionSeg}s</span>
                  {falta && <span className="text-amber-400">falta completar</span>}
                </div>
                <textarea
                  value={l.texto}
                  onChange={(e) => setEdiciones({ ...ediciones, [l.i]: e.target.value })}
                  rows={2}
                  className={`jr-field rounded-lg px-3 py-2 text-[13px] leading-relaxed ${falta ? 'border-amber-500/40' : ''}`}
                />
              </div>
            )
          })}
        </div>

        <p className="mt-3 text-[11.5px] text-[#8b8b8b]">
          {guionActual.length} caracteres ({diferencia >= 0 ? '+' : ''}{diferencia} vs. el original)
        </p>

        {sucio && (
          <button onClick={guardar} disabled={guardando} className={`${btnPrimary} mt-3`}>
            {guardando ? <><span className={spinner} />Guardando...</> : 'Guardar los cambios'}
          </button>
        )}
      </div>

      {!!pendientes.length && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-amber-300">
          {pendientes.length === 1 ? 'Queda un dato' : `Quedan ${pendientes.length} datos`} sin
          completar. No los inventamos porque no estaban en lo que nos diste, y el video los
          leería en voz alta tal cual. Escríbelos arriba y guarda.
        </div>
      )}

      {consistencyBlock && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#121214] px-4 py-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
            Identidad bloqueada del personaje
          </div>
          <p className="text-[12.5px] leading-relaxed text-[#cfcfcf]">{consistencyBlock}</p>
        </div>
      )}

      {error && <div className={errorBox}>{error}</div>}
      {characterError && (
        // Distinto del `error` de arriba: si esto se ve, el guión de arriba SÍ es el
        // que quedó guardado — lo que falló es construir el personaje (identidad +
        // voz), no la adaptación. "Reintentar" (el botón de abajo) vuelve a intentar
        // ambos pasos; re-adaptar un guión que ya está bien no tiene costo de cuota
        // (`video-adapt` no tiene tope per-step) y el paso caro que sí falló es el que
        // esto describe.
        <div className={errorBox}>{characterError}</div>
      )}
      {/* `sucio` bloquea también: el render lee `adapted` de la BASE, no del store, así
          que avanzar con ediciones sin guardar renderizaría el texto viejo — incluidos
          los corchetes que el usuario acaba de reemplazar en pantalla. */}
      <button
        onClick={() => patch({ step: STEP.LOTES })}
        disabled={!!pendientes.length || sucio}
        className={btnPrimary}
      >
        {sucio ? 'Guarda los cambios para continuar' : 'Preparar los lotes →'}
      </button>
      <button onClick={() => run()} disabled={isLoading} className={btnGhost}>
        {isLoading ? <><span className={spinner} />Reescribiendo...</> : 'No me convence — adaptar otra vez'}
      </button>
    </div>
  )
}
