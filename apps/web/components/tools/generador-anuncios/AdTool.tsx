'use client'

import { useEffect, useState } from 'react'
import { ListChecks, MessageSquare } from 'lucide-react'
import AdWizard from './AdWizard'
import AdChat from './AdChat'

type View = 'wizard' | 'chat'
const VIEW_KEY = 'anuncios_view'

/** Selector Wizard / Chat. Las dos vistas trabajan sobre la MISMA sesión: cambiar no pierde nada. */
function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
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

export default function AdTool() {
  const [view, setView] = useState<View>('wizard')

  // La preferencia guardada se lee al montar: localStorage no existe en el server.
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === 'chat') setView('chat') } catch { /* sin storage: wizard */ }
  }, [])

  function change(next: View) {
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* nada */ }
    setView(next)
  }

  const switcher = <ViewSwitch view={view} onChange={change} />
  // `key` por vista: cada una se monta de cero y relee la sesión del servidor, así lo que se hizo
  // en la otra ya está ahí.
  return view === 'chat' ? <AdChat key="chat" switcher={switcher} /> : <AdWizard key="wizard" switcher={switcher} />
}
