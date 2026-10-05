import { NextRequest, NextResponse } from 'next/server'
import { createAgentUIStreamResponse, validateUIMessages, type UIMessage } from 'ai'
import { createLandingAgent, type LandingUIMessage } from '@/lib/landing-v2/agent'
import { saveV2Messages } from '@/lib/landing-v2/db'
import { CHAT_KIND, gate, record } from '@/lib/landing-v2/quota'
import { errorResponse, load, notFound } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Un turno puede aprobar + generar una sección (copy + brief + imagen con respaldo).
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
    abortSignal: req.signal,
    onFinish: async ({ messages: all }) => {
      await saveV2Messages(id, all)
      await record(id, CHAT_KIND, row.ctx)
    },
  })
}
