'use client'

import { useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import type { ProductScan } from '@/lib/types'

const btnPrimary = 'h-11 w-full rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'
const inputClass = 'jr-field w-full h-10 rounded-xl px-3 text-[13px]'

export default function Section2Product() {
  const { sessionId, productUrl, logoUrl: storedLogoUrl, productName: storedName, whatItIs: storedWhatItIs, whatItDoes: storedWhatItDoes, targetAudience: storedAudience, setProductData, setLoading, isLoading } = useWizardStore()
  const [productFile, setProductFile] = useState<File | null>(null)
  const [productPreview, setProductPreview] = useState<string | null>(productUrl)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(storedLogoUrl)
  const [answers, setAnswers] = useState({
    productName: storedName ?? '',
    whatItIs: storedWhatItIs ?? '',
    whatItDoes: storedWhatItDoes ?? '',
    targetAudience: storedAudience ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  const canSubmit = (!!productFile || !!productUrl) && !!answers.productName && !!answers.whatItIs && !!answers.whatItDoes && !!answers.targetAudience

  async function handleSubmit() {
    if (!sessionId || !canSubmit || isLoading) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      if (productFile) {
        form.append('product', productFile)
      } else {
        // Re-use previously uploaded image
        const res = await fetch(productUrl!)
        const blob = await res.blob()
        form.append('product', new File([blob], 'product', { type: blob.type || 'image/jpeg' }))
      }
      if (logoFile) {
        form.append('logo', logoFile)
      } else if (storedLogoUrl) {
        const res = await fetch(storedLogoUrl)
        const blob = await res.blob()
        form.append('logo', new File([blob], 'logo', { type: blob.type || 'image/png' }))
      }
      form.append('productName', answers.productName)
      form.append('whatItIs', answers.whatItIs)
      form.append('whatItDoes', answers.whatItDoes)
      form.append('targetAudience', answers.targetAudience)

      const res = await fetch(`/api/generador-anuncios/sessions/${sessionId}/analyze-product`, { method: 'POST', body: form })
      const data = await res.json() as { scan?: ProductScan; productUrl?: string; logoUrl?: string | null; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al analizar el producto')
      setProductData({
        productUrl: data.productUrl!,
        logoUrl: data.logoUrl ?? null,
        productScan: data.scan!,
        productName: answers.productName,
        whatItIs: answers.whatItIs,
        whatItDoes: answers.whatItDoes,
        targetAudience: answers.targetAudience,
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#a98c88] mb-2">Imagen del producto *</p>
        <FileUpload label="Subir producto" onFile={(f) => { setProductFile(f); setProductPreview(URL.createObjectURL(f)) }} preview={productPreview} />
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#a98c88] mb-2">Logo (opcional)</p>
        <FileUpload label="Subir logo" onFile={(f) => { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) }} preview={logoPreview} variant="ghost" />
      </div>
      <div className="flex flex-col gap-3 pt-1">
        <p className="text-[12px] text-[#c9b4ae]">Cuatro preguntas rápidas:</p>
        {[
          { key: 'productName', placeholder: '¿Cómo se llama tu producto?' },
          { key: 'whatItIs', placeholder: '¿Qué es?' },
          { key: 'whatItDoes', placeholder: '¿Qué hace? (una frase corta)' },
          { key: 'targetAudience', placeholder: '¿Para quién es?' },
        ].map(({ key, placeholder }, i) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white/[0.05] text-[#a98c88] text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <input
              type="text"
              placeholder={placeholder}
              value={answers[key as keyof typeof answers]}
              onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
              className={inputClass}
            />
          </div>
        ))}
      </div>
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}
      <button onClick={handleSubmit} disabled={!canSubmit || isLoading} className={btnPrimary}>
        {isLoading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analizando producto...</>
        ) : 'Continuar →'}
      </button>
    </div>
  )
}
