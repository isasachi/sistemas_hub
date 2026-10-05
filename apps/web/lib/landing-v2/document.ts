// Extracción de texto de la investigación de mercado (PDF / Word) para landing v2. Sin LLM: el
// texto se extrae tal cual y el usuario lo revisa/edita antes de seguir (un modelo tiende a resumir).
import { extractText } from 'unpdf'
import mammoth from 'mammoth'

/** Tope de archivo. Las funciones de Vercel no aceptan bodies de más de 4,5 MB. */
export const MAX_DOC_BYTES = 4 * 1024 * 1024

export class DocumentError extends Error {}

export type DocKind = 'pdf' | 'docx'

/** Reconoce el tipo por la FIRMA del archivo, no por el nombre ni el mime que manda el browser. */
export function docKind(buf: Buffer, filename = ''): DocKind {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf'
  // .docx es un zip (PK\x03\x04). Un .doc viejo es OLE2 (D0 CF 11 E0): no se soporta sin deps pesadas.
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 'docx'
  if (buf[0] === 0xd0 && buf[1] === 0xcf || /\.doc$/i.test(filename))
    throw new DocumentError('Los archivos .doc antiguos no se pueden leer. Guárdalo como .docx o PDF e inténtalo de nuevo.')
  throw new DocumentError('Formato no soportado. Sube un PDF o un Word (.docx).')
}

export async function extractResearchDocument(buf: Buffer, filename = ''): Promise<string> {
  if (buf.length > MAX_DOC_BYTES) throw new DocumentError('El archivo pesa más de 4 MB. Sube uno más liviano o pega el texto.')
  const kind = docKind(buf, filename)
  let text: string
  try {
    text = kind === 'pdf'
      ? (await extractText(new Uint8Array(buf), { mergePages: true })).text
      : (await mammoth.extractRawText({ buffer: buf })).value
  } catch {
    throw new DocumentError('No se pudo leer el archivo. Verifica que no esté dañado ni protegido con contraseña.')
  }
  const clean = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) throw new DocumentError('El archivo no tiene texto seleccionable (¿es un escaneo?). Pega el texto en su lugar.')
  return clean
}
