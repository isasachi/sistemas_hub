import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { ScriptVersionsSchema, ConfirmedScriptSchema } from '@/lib/video-ads/types'

// `beats` presente = el usuario editó el copy en la pantalla previa al render. En ese
// caso mandan sus líneas y NO se toca `script_versions`: derivarlas de la versión otra
// vez las pisaría, y una sesión sin versions (ya confirmada) daría 409 al guardar.
// El tope real del prompt es global (4096 en KIE) y se verifica en generate-video;
// este max solo evita que un pegado gigante llegue a la DB.
const EditedBeat = z.object({
  t: z.string().max(40),
  dialogue: z.string().max(600),
  action: z.string().max(600),
  onScreenText: z.string().max(200),
})
const BodySchema = z.object({
  version: z.enum(['A', 'B']),
  beats: z.array(EditedBeat).min(1).max(30).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Guión inválido' }, { status: 400 })

  const { version, beats: edited } = parsed.data

  let beats
  if (edited) {
    beats = edited
  } else {
    if (!session.script_versions)
      return NextResponse.json({ error: 'Genera el guión primero' }, { status: 409 })
    const versions = ScriptVersionsSchema.parse(session.script_versions)
    beats = version === 'A' ? versions.versionA : versions.versionB
  }
  const confirmed = ConfirmedScriptSchema.parse({ version, beats })

  await updateVideoSession(id, { step: 4, confirmed_script: confirmed })
  return NextResponse.json({ ok: true })
}
