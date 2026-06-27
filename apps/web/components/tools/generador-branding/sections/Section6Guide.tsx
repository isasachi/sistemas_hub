'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBrandingStore } from '@/store/branding'

async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl; a.download = filename; a.click()
    URL.revokeObjectURL(objUrl)
  } catch { window.open(url, '_blank') }
}

export default function Section6Guide() {
  const { sessionId, brandName, direction, logoUrl, labelUrl, mockupUrl, startNewSession } = useBrandingStore()
  const router = useRouter()
  const [landingLoading, setLandingLoading] = useState(false)

  if (!direction) return null
  const slug = (brandName ?? 'marca').toLowerCase().replace(/\s+/g, '-')

  async function createLanding() {
    if (!sessionId || landingLoading) return
    setLandingLoading(true)
    try {
      const res = await fetch('/api/generador-landing/from-branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandingSessionId: sessionId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { id } = (await res.json()) as { id: string }
      if (!id) throw new Error('Sin id de sesión')
      localStorage.setItem('landing_session_id', id)
      router.push('/tools/generador-landing')
    } catch {
      setLandingLoading(false)
      alert('No se pudo crear la landing. Inténtalo de nuevo.')
    }
  }

  const Asset = ({ url, label, file }: { url: string; label: string; file: string }) => (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">{label}</p>
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] group">
        <img src={url} alt={label} className="w-full object-contain bg-[#0f0f0f]" />
        <button
          onClick={() => downloadImage(url, file)}
          className="absolute bottom-2 right-2 h-8 px-3 rounded-lg bg-black/60 backdrop-blur text-white text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border border-white/20"
        >
          ↓ Descargar
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a] mb-1">Guía de marca</p>
        <h2 className="text-[22px] font-bold text-[#f5f5f5]">{brandName}</h2>
        <p className="text-[13px] text-[#bdbdbd] mt-1">{direction.concept}</p>
      </div>

      {mockupUrl && <Asset url={mockupUrl} label="Producto final" file={`${slug}-mockup.png`} />}
      {logoUrl && <Asset url={logoUrl} label="Logo" file={`${slug}-logo.png`} />}
      {labelUrl && <Asset url={labelUrl} label="Etiqueta" file={`${slug}-etiqueta.png`} />}

      {/* Paleta */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a] mb-2">Paleta de colores</p>
        <div className="grid grid-cols-2 gap-2">
          {direction.palette.map((c) => (
            <div key={c.hex} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] p-2">
              <div className="w-8 h-8 rounded-lg border border-white/[0.12] shrink-0" style={{ backgroundColor: c.hex }} />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#f5f5f5] truncate">{c.name}</p>
                <button
                  onClick={() => navigator.clipboard?.writeText(c.hex.toUpperCase())}
                  className="text-[11px] text-[#8a8a8a] font-mono hover:text-[#ff9c4d] cursor-pointer transition-colors"
                  title="Copiar"
                >
                  {c.hex.toUpperCase()}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tipografía */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a] mb-2">Tipografía</p>
        <div className="rounded-xl border border-white/[0.06] p-3 flex flex-col gap-1">
          <p className="text-[13px] text-[#f5f5f5]"><span className="font-semibold">Titulares:</span> {direction.typography.headline}</p>
          <p className="text-[13px] text-[#f5f5f5]"><span className="font-semibold">Cuerpo:</span> {direction.typography.body}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {(mockupUrl || logoUrl) && (
          <button
            onClick={createLanding}
            disabled={landingLoading}
            className="h-11 px-4 rounded-xl bg-[#ff9c4d] text-[#1a1205] text-[13px] font-semibold hover:bg-[#ffae6b] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default self-start"
          >
            {landingLoading ? 'Creando landing…' : 'Crear landing con esta marca'}
          </button>
        )}
        <button
          onClick={startNewSession}
          className="h-11 px-4 rounded-xl border border-white/[0.14] text-[#f5f5f5] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent self-start"
        >
          Crear otra marca
        </button>
      </div>
    </div>
  )
}
