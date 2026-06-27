// Lee el contador per-step de una sesión para hidratar la UI al resumir.
// Fail-soft: cualquier error → {} (el contador cae al fallback ?? 3 en la UI).
export async function fetchRegens(sessionId: string): Promise<Record<string, number>> {
  try {
    const res = await fetch(`/api/gen-quota?sessionId=${encodeURIComponent(sessionId)}`)
    if (!res.ok) return {}
    return (await res.json()) as Record<string, number>
  } catch {
    return {}
  }
}
