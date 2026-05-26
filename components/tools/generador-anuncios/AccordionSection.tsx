'use client'

import React from 'react'

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
    border: 'border border-dashed border-white/[0.08]',
    headerBg: '',
    opacity: 'opacity-45',
    iconBg: 'bg-white/[0.04]',
    iconBorder: 'border-white/[0.1]',
    iconColor: 'text-[#475569]',
  },
  active: {
    border: 'border border-[rgba(245,158,11,0.4)] shadow-[0_0_0_1px_rgba(245,158,11,0.08)]',
    headerBg: 'bg-[rgba(245,158,11,0.06)]',
    opacity: '',
    iconBg: 'bg-[rgba(245,158,11,0.15)]',
    iconBorder: 'border-[rgba(245,158,11,0.4)]',
    iconColor: 'text-[#f59e0b]',
  },
  completed: {
    border: 'border border-[rgba(34,197,94,0.25)]',
    headerBg: 'bg-[rgba(34,197,94,0.04)]',
    opacity: '',
    iconBg: 'bg-[rgba(34,197,94,0.15)]',
    iconBorder: 'border-[rgba(34,197,94,0.35)]',
    iconColor: 'text-[#22c55e]',
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
            <span className={`text-[11px] font-bold ${s.iconColor}`}>✓</span>
          ) : status === 'locked' ? (
            <span className="text-[11px]">🔒</span>
          ) : (
            <span className={`text-[11px] font-bold ${s.iconColor}`}>{index}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-bold ${status === 'locked' ? 'text-[#475569]' : 'text-[#f1f5f9]'}`}>
            {title}
          </p>
          {status === 'completed' && summary && (
            <p className="text-[11px] text-[#94a3b8] mt-0.5 truncate">{summary}</p>
          )}
        </div>
        {canReopen && (
          <span className="text-[10px] text-[#475569] shrink-0">▼ editar</span>
        )}
      </div>

      {/* Body */}
      {isOpen && (
        <div className="bg-[#0d0d18] px-4 pb-5 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}
