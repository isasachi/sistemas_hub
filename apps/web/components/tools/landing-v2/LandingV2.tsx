'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, ListChecks } from 'lucide-react'
import { hasProgress, sessionKey, VIEW_KEY, type View } from './client'
import WizardV2 from './WizardV2'
import ChatV2 from './ChatV2'

/** Selector Wizard / Chat. Cambiar con una sesión en curso avisa que la otra vista empieza de cero. */
export function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { v: View; label: string; Icon: typeof ListChecks }[] = [
    { v: 'wizard', label: 'Wizard', Icon: ListChecks },
    { v: 'chat', label: 'Chat', Icon: MessageSquare },
  ]
  return (
    <div role="radiogroup" aria-label="Vista" className="flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-0.5">
      {opts.map(({ v, label, Icon }) => (
        <button key={v} type="button" role="radio" aria-checked={view === v} aria-label={label} onClick={() => view !== v && onChange(v)}
                className={[
                  'flex h-8 items-center gap-1.5 rounded-[10px] border-0 px-3 font-sans text-[12px] font-semibold cursor-pointer transition-colors',
                  view === v ? 'bg-[rgba(246,242,235,0.12)] text-[#f6f2eb]' : 'bg-transparent text-[#a98c88] hover:text-[#efe7e0]',
                ].join(' ')}>
          <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}

export default function LandingV2({ initialView }: { initialView: View | null }) {
  const router = useRouter()
  const [view, setView] = useState<View>(initialView ?? 'wizard')

  // Sin `?view=` manda la preferencia guardada (se lee al montar: localStorage no existe en el server).
  useEffect(() => {
    if (initialView) return
    try {
      const pref = localStorage.getItem(VIEW_KEY)
      if (pref === 'chat' || pref === 'wizard') setView(pref)
    } catch { /* sin storage: wizard */ }
  }, [initialView])

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view) } catch { /* nada */ }
  }, [view])

  function change(next: View) {
    // No se migran sesiones entre vistas en esta iteración: la otra vista arranca en blanco.
    if (hasProgress(view) && !window.confirm(`Se iniciará una sesión nueva en la vista ${next === 'chat' ? 'Chat' : 'Wizard'}. ¿Continuar?`)) return
    try { localStorage.removeItem(sessionKey(next)) } catch { /* nada */ }
    setView(next)
    router.replace(`?view=${next}`, { scroll: false })
  }

  const switcher = <ViewSwitch view={view} onChange={change} />
  return view === 'chat' ? <ChatV2 key="chat" switcher={switcher} /> : <WizardV2 key="wizard" switcher={switcher} />
}
