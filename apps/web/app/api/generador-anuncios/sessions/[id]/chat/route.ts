import { NextRequest, NextResponse } from 'next/server'
import { consumeStream, createAgentUIStreamResponse, validateUIMessages, type UIMessage } from 'ai'
import { CHAT_KIND, createAnunciosAgent, type AnunciosUIMessage } from '@/lib/anuncios/agent'
import { gate } from '@/lib/anuncios/core'
import { updateSession } from '@/lib/db'
import { recordGenQuota } from '@/lib/gen-quota'
import { errorResponse, load, notFound } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Un turno puede elegir el copy y renderizar el anuncio: lo mismo que las rutas de imagen.
export const maxDuration = 300

// El cliente manda SOLO el mensaje nuevo; el historial sale de la base (no se le cree al cliente).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row) return notFound()
  const { message } = (await req.json().catch(() => ({}))) as { message?: UIMessage }
  if (!message || message.role !== 'user') return NextResponse.json({ error: 'Mensaje inválido' }, { status: 400 })
  // El turno de chat es texto: no gasta crédito, solo cuenta al backstop diario. Las imágenes se
  // cobran dentro del núcleo, igual que en el wizard.
  try { await gate(id, CHAT_KIND, row.ctx) } catch (e) { return errorResponse(e) }

  const previos = (row.session.messages ?? []) as UIMessage[]
  // Un "Reintentar" reenvía el último mensaje del usuario: no se duplica en el historial.
  const history = previos.at(-1)?.id === message.id ? previos.slice(0, -1) : previos
  // El texto de ESTE mensaje y los de los anteriores alimentan los candados deterministas del
  // agente (qué adjuntó, qué eligió, si el cambio pedido es de ahora).
  const textOf = (m: UIMessage) => m.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')
  const agent = createAnunciosAgent(row.session, row.ctx, {
    userText: textOf(message),
    previos: history.filter((m) => m.role === 'user').map(textOf),
  })
  const messages = await validateUIMessages<AnunciosUIMessage>({ messages: [...history, message], tools: agent.tools })
  await updateSession(id, { messages }) // el mensaje del usuario no se pierde aunque el stream se corte

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    originalMessages: messages,
    // SIN `abortSignal: req.signal`, a propósito: recargar a mitad de un render (la parte lenta)
    // mataría el turno con el crédito ya gastado y el historial sin la imagen. `consumeStream`
    // termina el turno del lado del servidor aunque el cliente se vaya, y `onFinish` lo guarda.
    consumeSseStream: consumeStream,
    onFinish: async ({ messages: all }) => {
      await updateSession(id, { messages: all })
      await recordGenQuota(id, CHAT_KIND, row.ctx.userId)
    },
  })
}
