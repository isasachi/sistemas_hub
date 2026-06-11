// Dispara el workflow de scrape vía repository_dispatch cuando un usuario
// consulta un nicho que no existe (cold start), para no esperar al cron de 12h.
// Vercel solo hace este POST a la API de GitHub: el scrape y el LLM siguen
// corriendo únicamente en GitHub Actions (las reglas de costo no cambian).
//
// Env requeridas (si faltan, se omite el dispatch y el cron lo levanta igual):
//   GITHUB_REPO            "owner/repo" (ej: "isaac/sistemas_hub")
//   GITHUB_DISPATCH_TOKEN  PAT fine-grained con permiso Contents: read+write

export async function triggerNicheScrape(niche: string): Promise<boolean> {
  const repo = process.env.GITHUB_REPO
  const token = process.env.GITHUB_DISPATCH_TOKEN
  if (!repo || !token) return false

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: 'scrape-niche', client_payload: { niche } }),
    })
    return res.status === 204
  } catch {
    return false // best-effort: el cron de 12h es el respaldo
  }
}
