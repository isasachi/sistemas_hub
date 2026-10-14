// Verificador DETERMINISTA del copy de landing v2: "el modelo redacta, el código verifica".
//
// Existe porque los wireframes traen ejemplos con forma de valor ("+10,000 clientes satisfechos •
// 4.8/5 estrellas", "Garantía X días", "Envío gratis • Pago contra entrega", "Últimas unidades") y la
// ley del repo —pagada 6 veces— es que el modelo los devuelve como contenido. La regla del system
// prompt ("Use ONLY provided data") es la intención; esto es la garantía:
//
//  - toda CIFRA del copy tiene que aparecer en los datos del usuario;
//  - todo término de RIESGO (garantía, envío, contra entrega, urgencia, certificaciones, aval médico,
//    medios de pago, prueba social) tiene que aparecer en los datos del usuario.
//
// Se mide contra el texto normalizado (minúsculas, sin tildes). Falla CERRADO: ante la duda, el
// término se marca y el caller reintenta o lo quita — nunca se publica un claim sin respaldo.
import type { LandingInputs, SectionDesign, Testimonial } from './schemas'

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Raíces normalizadas. Ampliar agregando términos, no aflojando el match.
export const RISK_TERMS = [
  'garantia', 'garantiz', 'devolucion', 'reembolso', 'sin riesgo',
  'gratis', 'envio', 'delivery', 'contra entrega', 'contraentrega', 'efectivo',
  // Urgencia. Medido en el probe del 2026-10-05: sin datos de urgencia, Gemini escribió "aprovecha
  // nuestra oferta antes de que finalice" y "promociones disponibles… hoy" en 2 de 6 secciones.
  'stock', 'ultimas unidades', 'agota', 'tiempo limitado', 'hoy', 'termina', 'finali', 'antes de que',
  'oferta limitada', 'promocion', 'ultima oportunidad', 'ultimo dia',
  'certificad', 'aprobad', 'registro sanitario', 'digesa', 'fda', 'iso ',
  'clinicamente', 'dermatologicamente', 'cientificamente', 'comprobado', 'estudio',
  'medic', 'doctor', 'dermatolog', 'nutricionista', 'especialista', 'experto',
  'yape', 'plin', 'tarjeta', 'visa', 'mastercard', 'transferencia',
  'clientes satisfechos', 'estrellas', 'resenas', 'miles de', '★',
  '100%', 'natural', 'organico', 'sin quimicos', 'parabenos',
]

/** Todo lo que el usuario dio, como un solo texto normalizado: lo único que el copy puede afirmar. */
export function sourceText(inputs: LandingInputs, testimonials: Testimonial[] = []): string {
  const packs = inputs.pricing.packs.map((p) =>
    [p.name, p.quantity, p.price, p.price.toFixed(2), p.compareAt ?? '', p.compareAt?.toFixed(2) ?? '',
      p.compareAt ? Math.round((1 - p.price / p.compareAt) * 100) + '%' : '',
      p.compareAt ? (p.compareAt - p.price).toFixed(2) : '', p.label ?? ''].join(' '))
  return norm([
    inputs.productName, inputs.marketResearch, inputs.pricing.notes,
    ...packs, ...testimonials.map((t) => `${t.name ?? ''} ${t.city ?? ''} ${t.text}`),
  ].join('\n'))
}

const digits = (s: string) => s.replace(/[.,\s]/g, '')
const NUM = /\d+(?:[.,]\d+)*/g

export interface Violation { field: string; token: string }

/** Cifras y términos de riesgo de `text` que NO aparecen en `source` (ya normalizado). */
export function unsupported(text: string, source: string): string[] {
  const t = norm(text)
  const out: string[] = []
  // Por TOKEN y no por substring: concatenadas, las cifras del usuario contienen casi cualquier número corto.
  const srcNums = new Set([...source.matchAll(NUM)].map((m) => digits(m[0])))
  for (const m of t.matchAll(NUM)) {
    // "Paso 1/2/3" es numeración del wireframe, no una cifra que afirmar.
    if (/paso\s*$/.test(t.slice(0, m.index)) && m[0].length === 1) continue
    if (!srcNums.has(digits(m[0]))) out.push(m[0])
  }
  for (const term of RISK_TERMS) if (t.includes(term) && !source.includes(term)) out.push(term.trim())
  return out
}

export function verifyTexts(texts: SectionDesign['texts'], source: string): Violation[] {
  return texts.flatMap((t, i) => unsupported(t.text, source).map((token) => ({ field: `texts.${i}`, token })))
}

/** Último recurso de `verifyTexts`: fuera las líneas sin respaldo. */
export function stripUnsupportedTexts(texts: SectionDesign['texts'], source: string): SectionDesign['texts'] {
  return texts.filter((t) => t.text.trim() && unsupported(t.text, source).length === 0)
}

/** Instrucción para el reintento: nombra lo que no tiene respaldo, sin dar valores de reemplazo. */
export function correctionFor(v: Violation[]): string {
  const tokens = [...new Set(v.map((x) => x.token))].join(', ')
  return `CORRECTION: the previous texts contained claims or numbers NOT present in the user's data (${tokens}). Rewrite them using ONLY facts present in the provided data. If the data does not support a text, omit that text.`
}
