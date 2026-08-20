import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { sessionHref, tools } from './tools'

// Rutas REALES: cada carpeta con page.tsx bajo app/, sin los grupos (xxx).
function rutas(dir = 'app', url = ''): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (e === 'page.tsx') out.push(url || '/')
    else if (statSync(p).isDirectory()) {
      const seg = e.startsWith('(') && e.endsWith(')') ? '' : `/${e}`
      out.push(...rutas(p, url + seg))
    }
  }
  return out
}

const REALES = rutas()
const existe = (url: string) => {
  const u = url.split('?')[0].split('/').filter(Boolean)
  return REALES.some((r) => {
    const p = r.split('/').filter(Boolean)
    return p.length === u.length && p.every((seg, i) => seg === u[i] || seg.startsWith('['))
  })
}

// Las 5 tools cuyas sesiones aparecen como card en el historial del dashboard
// (SESSION_TOOLS en ProjectHistory). buscador-productos no produce sesiones.
const CON_SESION = [
  'generador-anuncios',
  'generador-branding',
  'generador-landing',
  'generador-video-ads',
  'calculadora-costos',
]

describe('rutas de las tools', () => {
  it('el sanity check se apoya en rutas que sí encontró', () => {
    expect(REALES.length).toBeGreaterThan(10)
    expect(existe('/tools/generador-anuncios/sesion/abc')).toBe(true)
    expect(existe('/tools/no-existe/sesion/abc')).toBe(false)
  })

  // El bug: ProjectHistory linkeaba TODA card a /tools/<slug>/sesion/<id> y
  // branding nunca tuvo esa ruta → 404 al hacerle click.
  it('la card de cada tool con sesiones apunta a una ruta que existe', () => {
    for (const slug of CON_SESION) {
      expect(existe(sessionHref(slug, 'abc123')), `card de ${slug}`).toBe(true)
    }
  })

  it('cada tool del registro tiene su página', () => {
    for (const t of tools) {
      expect(existe(`/tools/${t.slug}`), `página de ${t.slug}`).toBe(true)
    }
  })
})
