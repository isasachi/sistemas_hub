import { currentCreditStatus } from '@/lib/credits'
import { TEMPLATES, templateImageUrl } from '@/lib/anuncios/templates'
import { anunciosPosibles, opcionesDeLote } from '@ph/shared'

/**
 * El catálogo de plantillas + cuántos anuncios puede pedir ESTE usuario.
 *
 * ⚠️ LAS DOS COSAS EN UNA SOLA RUTA A PROPÓSITO. El selector de plantilla y el selector de
 * cantidad se pintan en el mismo wizard, y el número de anuncios NO lo puede decidir el cliente:
 * sale del plan recortado por los créditos que quedan. Con el catálogo importado directo en el
 * componente haría falta igual una segunda llamada para los créditos, y `templateImageUrl` lee
 * `SUPABASE_URL`, que no es pública.
 *
 * Solo lectura y sin cuota: no llama a ningún modelo.
 */
export async function GET() {
  const credits = await currentCreditStatus()
  // Sin sesión resuelta se cae al plan más bajo, nunca al más alto — el mismo criterio que el
  // serving del buscador.
  const maximo = credits ? anunciosPosibles(credits.tier, credits.restantes) : 1

  return Response.json({
    plantillas: TEMPLATES.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      objetivo: t.objetivo,
      descripcion: t.descripcion,
      recomendadaPara: t.recomendadaPara,
      imagenUrl: templateImageUrl(t.id),
      // Cuántos textos se escriben — le dice al usuario cuánto copy va a ver antes de generar.
      huecos: t.slots.filter((s) => s.fuente === 'modelo').length,
    })),
    credits,
    maximo,
    opciones: opcionesDeLote(maximo),
  })
}
