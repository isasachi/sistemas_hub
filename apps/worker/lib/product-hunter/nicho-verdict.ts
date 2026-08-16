// El ÚNICO paso con LLM del pipeline. Responde lo que el código no puede:
// ¿esto es un producto físico, y es un producto DEL nicho buscado?
//
// Todo lo demás (descubrir, contar anuncios, rangos, share de monoproducto) es
// determinista y ya está resuelto antes de llegar acá. El modelo no ve números
// ni puede cambiarlos: recibe texto y devuelve un enum. Esa es toda su
// superficie.
//
// ⚠️ COSTO: 1 llamada Haiku por candidato, y solo por los que sobrevivieron al
// filtro determinista. Solo en el worker, nunca en Vercel.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { normalize } from './product-key'

export const MODEL = process.env.PH_NICHO_MODEL ?? 'claude-haiku-4-5'

// ⚠️ La pregunta del segundo punto es literal y viene de un fallo medido: un
// cabezal de ducha con 221 anuncios cuyo copy dice "evita caída de pelo,
// irritación de piel, acné" entraba como producto de acné. Mencionar el nicho
// no es pertenecer a él. El mismo caso cubre un suplemento prebiótico que
// promete mejorar la piel y unas plantillas de pádel que hablan de "espinillas".
const SYSTEM = `Decides dos cosas sobre un anuncio de Meta Ads Library.

1. QUÉ SE VENDE:
- "fisico": un objeto tangible que se le envía al comprador (crema, jabón, parches, cápsulas, aparato).
- "digital": software, apps, juegos, suscripciones.
- "contenido": cursos, ebooks, planes, membresías, asesorías informativas.
- "servicio": algo que se presta o se visita (clínicas, spas, limpiezas faciales, láser, delivery, marketplaces sin producto propio).
- "indeterminado": el texto no alcanza.

2. SI EL PRODUCTO PERTENECE AL NICHO BUSCADO.
La prueba no es si el anuncio MENCIONA el nicho, sino si el producto está hecho PARA ese problema.
- Un jabón formulado contra el acné pertenece al nicho "acné".
- Un filtro de ducha que entre sus diez beneficios nombra el acné NO pertenece: está hecho para filtrar agua.
- Un suplemento digestivo que dice mejorar la piel NO pertenece: está hecho para el intestino.
- Un producto para manchas o despigmentación NO pertenece al nicho "acné" aunque lo compre el mismo público.

⚠️ DOS FORMAS DE NO PERTENECER QUE HAY QUE RECHAZAR SIEMPRE:
a) OTRA CATEGORÍA DE NECESIDAD. Si el producto resuelve un problema distinto, no pertenece — aunque el público se solape y aunque comparta el rubro. Un suplemento de remolacha para la circulación NO pertenece al nicho "calcio". Unas cápsulas para dormir NO pertenecen al nicho "colágeno". Si tu propia explicación necesita empezar con "aunque", la respuesta es NO.
b) COINCIDENCIA DE PALABRA. Si el nombre del nicho aparece con OTRO significado, no pertenece. Un short de baño con corte "taper" NO pertenece al nicho "taper"; unas plantillas que alivian el dolor de "espinillas" (el hueso) NO pertenecen al nicho de las espinillas de la piel.

Fuera de esos dos casos, ante la duda razonable responde que SÍ pertenece: perder un producto legítimo es peor que dejar pasar uno dudoso.

3. CITA: copia TEXTUAL un fragmento corto del texto que te dieron y que justifique tu decisión sobre el nicho. Cópialo carácter por carácter, sin reescribirlo. Si no hay ninguno, deja la cita vacía.

Devuelve además el nombre corto del producto (dos o tres palabras).`

const VerdictSchema = z.object({
  kind: z.enum(['fisico', 'digital', 'servicio', 'contenido', 'indeterminado']),
  // Opcional con default true: si el modelo lo omite NO se descarta el producto.
  perteneceAlNicho: z.boolean().optional().default(true),
  productName: z.string().optional().default(''),
  cita: z.string().optional().default(''),
  motivo: z.string().optional().default(''),
})
export type NichoVerdict = z.infer<typeof VerdictSchema> & { citaVerificada: boolean }

const TOOL: Anthropic.Tool = {
  name: 'registrar_veredicto',
  description: 'Registra qué se vende y si pertenece al nicho buscado.',
  input_schema: z.toJSONSchema(VerdictSchema) as Anthropic.Tool.InputSchema,
}

export interface VerdictInput {
  niche: string
  advertiser: string | null
  productPath: string | null
  textos: string[]
}

/**
 * La cita tiene que existir LITERAL en el texto que se le pasó al modelo.
 * Es la verificación en código de la única salida en prosa: si el modelo la
 * inventa, el veredicto queda sin respaldo y la fila va a revisión en vez de
 * publicarse. Se compara normalizado (sin acentos ni mayúsculas) porque el
 * modelo reescribe tildes al copiar, no porque se acepte una paráfrasis.
 */
export function citaRespaldada(cita: string, textos: string[]): boolean {
  const c = normalize(cita).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (c.length < 8) return false
  const fuente = normalize(textos.join(' ')).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')
  return fuente.includes(c)
}

export async function juzgarNicho(ai: Anthropic, input: VerdictInput): Promise<NichoVerdict> {
  const textos = input.textos.map((t) => t.replace(/\{\{[^}]*\}\}/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 12).slice(0, 12)

  if (!textos.length) {
    return {
      kind: 'indeterminado', perteneceAlNicho: true, productName: '',
      cita: '', motivo: 'el anuncio no trae texto real', citaVerificada: false,
    }
  }

  const res = await ai.messages.create({
    model: MODEL,
    max_tokens: 500,
    temperature: 0,
    // El system es idéntico en todos los candidatos: cachearlo lo cobra a 0.1x
    // en las lecturas siguientes, igual que en anthropic.ts.
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{
      role: 'user',
      content:
        `Nicho buscado: "${input.niche}"\n` +
        `Anunciante: "${input.advertiser ?? '(sin nombre)'}"\n` +
        `URL del producto: ${input.productPath ?? '(no hay)'}\n\n` +
        `Textos de sus anuncios de ese producto:\n${textos.map((t) => `· ${t}`).join('\n')}`,
    }],
  })

  const use = res.content.find((b) => b.type === 'tool_use')
  if (!use || use.type !== 'tool_use') throw new Error('sin tool_use en el veredicto de nicho')
  const parsed = VerdictSchema.parse(use.input)
  return { ...parsed, citaVerificada: citaRespaldada(parsed.cita, textos) }
}
