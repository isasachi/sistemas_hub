'use client'

import React from 'react'
import { Check, Lock, ChevronDown } from 'lucide-react'

type SectionStatus = 'locked' | 'active' | 'completed'

interface AccordionSectionProps {
  index: number
  title: string
  status: SectionStatus
  summary?: string
  children: React.ReactNode
  onReopen?: () => void
}

const statusStyles: Record<SectionStatus, {
  border: string
  headerBg: string
  opacity: string
  iconBg: string
  iconBorder: string
  iconColor: string
}> = {
  locked: {
    border: 'border border-dashed border-white/[0.06]',
    headerBg: '',
    opacity: 'opacity-45',
    iconBg: 'bg-white/[0.04]',
    iconBorder: 'border-white/[0.1]',
    iconColor: 'text-[#8a8a8a]',
  },
  active: {
    border: 'border border-[rgba(255,156,77,0.4)] shadow-[0_0_0_1px_rgba(255,156,77,0.08)]',
    headerBg: 'bg-[rgba(255,156,77,0.06)]',
    opacity: '',
    iconBg: 'bg-[rgba(255,156,77,0.15)]',
    iconBorder: 'border-[rgba(255,156,77,0.4)]',
    iconColor: 'text-[#ff9c4d]',
  },
  completed: {
    border: 'border border-[rgba(44,207,111,0.25)]',
    headerBg: 'bg-[rgba(44,207,111,0.04)]',
    opacity: '',
    iconBg: 'bg-[rgba(44,207,111,0.15)]',
    iconBorder: 'border-[rgba(44,207,111,0.35)]',
    iconColor: 'text-[#2ccf6f]',
  },
}

export default function AccordionSection({
  index,
  title,
  status,
  summary,
  children,
  onReopen,
}: AccordionSectionProps) {
  const s = statusStyles[status]
  const isOpen = status === 'active'
  const canReopen = status === 'completed' && !!onReopen

  return (
    <div className={`rounded-2xl overflow-hidden transition-all duration-300 ${s.border} ${s.opacity}`}>
      {/* Header */}
      <div
        className={`px-4 py-3 flex items-center gap-3 ${s.headerBg} ${isOpen ? 'border-b border-white/[0.06]' : ''} ${canReopen ? 'cursor-pointer' : ''}`}
        onClick={canReopen ? onReopen : undefined}
      >
        <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 border ${s.iconBg} ${s.iconBorder}`}>
          {status === 'completed' ? (
            <Check className={`w-3 h-3 ${s.iconColor}`} strokeWidth={3} />
          ) : status === 'locked' ? (
            <Lock className={`w-3 h-3 ${s.iconColor}`} strokeWidth={2.5} />
          ) : (
            <span className={`readout text-[11px] font-bold ${s.iconColor}`}>{index}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-bold ${status === 'locked' ? 'text-[#8a8a8a]' : 'text-[#f5f5f5]'}`}>
            {title}
          </p>
          {status === 'completed' && summary && (
            <p className="text-[11px] text-[#bdbdbd] mt-0.5 truncate">{summary}</p>
          )}
        </div>
        {canReopen && (
          <span className="flex items-center gap-1 text-[10px] text-[#8a8a8a] shrink-0">
            <ChevronDown className="w-3 h-3" /> editar
          </span>
        )}
      </div>

      {/* Body */}
      {isOpen && (
        <div className="bg-[#0f0f0f] px-4 pb-5 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}
