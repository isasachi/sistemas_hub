import { NextRequest, NextResponse } from 'next/server'
import { consumeStream, createAgentUIStreamResponse, validateUIMessages, type UIMessage } from 'ai'
import { createLandingAgent, type LandingUIMessage } from '@/lib/landing-v2/agent'
import { saveV2Messages } from '@/lib/landing-v2/db'
import { CHAT_KIND, gate, record } from '@/lib/landing-v2/quota'
import { errorResponse, load, notFound } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Un turno puede aprobar + generar una sección (análisis si falta + diseño del director + imagen):
// el director va con 90 s por intento para que el peor caso quepa acá (ver `DIRECTOR_TIMEOUT_MS`).
export const maxDuration = 300

// El cliente manda SOLO el mensaje nuevo; el historial sale de la base (no se le cree al cliente).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row) return notFound()
  const { message } = (await req.json().catch(() => ({}))) as { message?: UIMessage }
  if (!message || message.role !== 'user') return NextResponse.json({ error: 'Mensaje inválido' }, { status: 400 })
  try {
    await gate(id, CHAT_KIND, row.ctx)
  } catch (e) { return errorResponse(e) }

  const agent = createLandingAgent(row.session, row.ctx)
  // Un "Reintentar" reenvía el último mensaje del usuario: no se duplica en el historial.
  const history = row.messages.at(-1)?.id === message.id ? row.messages.slice(0, -1) : row.messages
  const messages = await validateUIMessages<LandingUIMessage>({ messages: [...history, message], tools: agent.tools })
  await saveV2Messages(id, messages) // el mensaje del usuario no se pierde aunque el stream se corte

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    originalMessages: messages,
    // SIN `abortSignal: req.signal`, a propósito: recargar a mitad de un render (la parte lenta)
    // mataba el turno, la sección quedaba a medias y el historial sin la imagen. `consumeStream`
    // termina el turno del lado del servidor aunque el cliente se vaya, y `onFinish` lo guarda: al
    // recargar, la conversación ya trae el resultado.
    consumeSseStream: consumeStream,
    onFinish: async ({ messages: all }) => {
      await saveV2Messages(id, all)
      await record(id, CHAT_KIND, row.ctx)
    },
  })
}
