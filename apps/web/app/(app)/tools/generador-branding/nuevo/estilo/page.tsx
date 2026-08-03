'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import BriefShell, { useBrief } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { CONFIRM_PATH } from '@/lib/branding/brief'
import { presetsForCategory, type PresetId } from '@/lib/branding/presets'

export default function EstiloPage() {
  const router = useRouter()
  const { brief, update } = useBrief()

  // Grilla ordenada por afinidad con la categoría del paso 1.
  const presets = presetsForCategory(brief?.category ?? null)
  const picked = brief?.presetId

  // Selección única de un toque: elegir ES avanzar (spec 1.4).
  function pick(id: PresetId) {
    update({ presetId: id })
    router.push(CONFIRM_PATH)
  }

  return (
    <BriefShell
      step={4}
      title="Elige el estilo"
      hint="Cada estilo trae su paleta y sus tipografías resueltas. Toca uno para continuar."
      hideNext
      wide
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {presets.map((p) => (
          <button key={p.id} type="button" onClick={() => pick(p.id)}
                  className={`flex flex-col gap-2 rounded-2xl overflow-hidden border transition-all cursor-pointer text-left ${
                    picked === p.id
                      ? 'border-[rgba(255,156,77,0.6)] shadow-[0_0_0_1px_rgba(255,156,77,0.25)]'
                      : 'border-white/[0.08] hover:border-white/[0.25]'
                  }`}>
            <Image src={p.thumbnail} alt={p.label} width={1024} height={1024}
                   className="w-full aspect-square object-cover" />
            <span className="px-3 pb-3 flex flex-col gap-0.5">
              <span className="text-[13px] font-bold text-[#f5f5f5]">{p.label}</span>
              <span className="flex gap-1 pt-1">
                {Object.values(p.palette).map((c) => (
                  <span key={c} className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ background: c }} />
                ))}
              </span>
            </span>
          </button>
        ))}
      </div>
    </BriefShell>
  )
}
