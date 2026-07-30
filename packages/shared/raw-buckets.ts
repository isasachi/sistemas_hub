// Agrupado del buscador simple (tool de testeo): tres rangos por nº de anuncios
// de la card. Semi-abiertos [min, max) → sin solape en 50 ni en 100.
export const RAW_BUCKETS = ['0-50', '50-100', '100+'] as const
export type RawBucket = (typeof RAW_BUCKETS)[number]

export const RAW_BUCKET_LABEL: Record<RawBucket, string> = {
  '0-50': '0 a 50 anuncios',
  '50-100': '50 a 100 anuncios',
  '100+': '100 a más anuncios',
}

export function isRawBucket(v: unknown): v is RawBucket {
  return typeof v === 'string' && (RAW_BUCKETS as readonly string[]).includes(v)
}

// max null = sin techo. min inclusivo, max exclusivo.
export function bucketRange(b: RawBucket): { min: number; max: number | null } {
  if (b === '0-50') return { min: 0, max: 50 }
  if (b === '50-100') return { min: 50, max: 100 }
  return { min: 100, max: null }
}
