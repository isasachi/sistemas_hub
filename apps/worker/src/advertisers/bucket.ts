// Bucket del anunciante (spec §29).
//
// ⚠️ Los cortes son `0_49 / 50_99 / 100_plus`, NO `0-50 / 50-100 / 100+`. El
// spec lo dice explícito y tiene razón: con "0-50" y "50-100" no se sabe dónde
// cae un anunciante con exactamente 50 anuncios, y ese es justo el borde que
// separa dos tramos comerciales.
//
// `raw-buckets.ts` del motor viejo tiene los cortes ambiguos y NO se toca:
// cambiarlo movería el serving del buscador que ya está en producción.
export type Bucket = '0_49' | '50_99' | '100_plus'

export function getBucket(count: number): Bucket {
  if (count < 50) return '0_49'
  if (count < 100) return '50_99'
  return '100_plus'
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  '0_49': '0-49',
  '50_99': '50-99',
  '100_plus': '100+',
}
