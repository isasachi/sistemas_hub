import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { readFromFile } from '@/scripts/seed-niches'

// Guard de la trampa #1: la directiva `# @priority N` es una línea de comentario,
// así que debe procesarse ANTES del strip de comentarios. Si se rompe, todo
// vuelve a priority 0 SIN error → el ORDER BY del drain se vuelve no-op y las
// partes del cuerpo dejan de ir primero, silenciosamente.
describe('seed-niches readFromFile — directiva @priority', () => {
  let file: string

  beforeAll(() => {
    file = path.join(os.tmpdir(), `niches-test-${process.pid}.txt`)
    fs.writeFileSync(
      file,
      [
        '# comentario normal',
        'cuello, columna',         // CSV: toma la primera columna
        '',
        '# @priority 1',
        '# header dentro de la sección priorizada',
        'rodilla',
        '   hombro  ',             // se normaliza (trim + minúsculas)
        '# @priority 0',
        'colageno',
        '# @priority 2',
        'lampara sal',
      ].join('\n'),
      'utf-8',
    )
  })

  afterAll(() => fs.rmSync(file, { force: true }))

  it('aplica la prioridad de la directiva a los nichos que la siguen', () => {
    const rows = readFromFile(file)
    const byNiche = Object.fromEntries(rows.map((r) => [r.niche, r.priority]))

    expect(byNiche['rodilla']).toBe(1)
    expect(byNiche['hombro']).toBe(1)
    expect(byNiche['colageno']).toBe(0)   // tras `# @priority 0`
    expect(byNiche['lampara sal']).toBe(2)
  })

  it('los nichos antes de cualquier directiva quedan en priority 0', () => {
    const rows = readFromFile(file)
    expect(rows.find((r) => r.niche === 'cuello')?.priority).toBe(0)
  })

  it('NO emite la directiva ni los comentarios como nichos', () => {
    const rows = readFromFile(file)
    const ids = rows.map((r) => r.niche)
    expect(ids).not.toContain('@priority 1')
    expect(ids.some((id) => id.startsWith('#'))).toBe(false)
    expect(ids).toEqual(['cuello', 'rodilla', 'hombro', 'colageno', 'lampara sal'])
  })
})
