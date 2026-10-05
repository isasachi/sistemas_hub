'use client'

// Imagen 9:16 de una sección con zoom (lightbox con <dialog> nativo) y descarga. La comparten el
// wizard v2 y el chat.
import { useRef, useState } from 'react'
import { Download, Maximize2, X } from 'lucide-react'
import JSZip from 'jszip'
import { SECTION_BY_ID, type SectionId } from '@/lib/landing-v2/catalog'

const fileName = (id: SectionId) => `landing-${String(SECTION_BY_ID[id].wf).padStart(2, '0')}-${id}.jpg`

async function blobOf(url: string) {
  const r = await fetch(url)
  if (!r.ok) throw new Error('No se pudo descargar la imagen.')
  return r.blob()
}

function save(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
  URL.revokeObjectURL(href)
}

export async function downloadOne(id: SectionId, url: string) {
  save(await blobOf(url), fileName(id))
}

export async function downloadAll(items: { id: SectionId; url: string }[]) {
  const zip = new JSZip()
  for (const it of items) zip.file(fileName(it.id), await blobOf(it.url))
  save(await zip.generateAsync({ type: 'blob' }), 'landing.zip')
}

export function SectionImage({ id, url, className = '' }: { id: SectionId; url: string; className?: string }) {
  const dlg = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const label = SECTION_BY_ID[id].es
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#160a0f] ${className}`}>
      <button type="button" onClick={() => dlg.current?.showModal()} className="block w-full cursor-zoom-in border-0 bg-transparent p-0" aria-label={`Ampliar ${label}`}>
        <img src={url} alt={label} className="aspect-[9/16] w-full object-cover" />
      </button>
      <div className="absolute right-2 top-2 flex gap-1.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <button type="button" onClick={() => dlg.current?.showModal()} aria-label="Ampliar"
                className="flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-black/60 text-white cursor-pointer">
          <Maximize2 className="h-4 w-4" />
        </button>
        <button type="button" disabled={busy} aria-label="Descargar"
                onClick={async () => { setBusy(true); try { await downloadOne(id, url) } finally { setBusy(false) } }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-black/60 text-white cursor-pointer disabled:opacity-50">
          <Download className="h-4 w-4" />
        </button>
      </div>
      <dialog ref={dlg} onClick={(e) => { if (e.target === dlg.current) dlg.current.close() }}
              className="m-auto max-h-[96vh] max-w-[96vw] overflow-visible bg-transparent p-0 backdrop:bg-black/85">
        <img src={url} alt={label} className="max-h-[92vh] w-auto rounded-xl" />
        <button type="button" onClick={() => dlg.current?.close()} aria-label="Cerrar"
                className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full border-0 bg-[#f6f2eb] text-[#1e0811] cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </dialog>
    </div>
  )
}
