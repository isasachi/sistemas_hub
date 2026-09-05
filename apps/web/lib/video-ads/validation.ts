import { z } from 'zod'
import type { UserInputs } from './types'

/**
 * FASE 0 del prompt maestro — validación obligatoria de variables críticas.
 * ---------------------------------------------------------------------------
 * Esto es determinista a propósito: la matriz pregunta "¿el usuario entregó este
 * dato?", y eso lo sabe el servidor sin llamar a ningún modelo. Pedírselo a un LLM
 * sería caro y, peor, abriría la puerta a que "rellene" lo que falta — exactamente
 * lo que la REGLA DE NO-ASUNCIÓN prohíbe.
 *
 * Las dos filas que NUNCA pueden marcarse CONFIRMADA desde la referencia son etnia
 * y acento: el spec es explícito en que deben venir del usuario.
 */

/** Literal del spec. Se guarda tal cual en el valor de una fila pendiente. */
export const CONFIRMACION_REQUERIDA = '[CONFIRMACIÓN REQUERIDA: especificar]'

export const ValidationRowSchema = z.object({
  variable: z.string(),
  valor: z.string(),
  fuente: z.enum(['USUARIO', 'REFERENCIA', 'ESTRUCTURA']),
  estado: z.enum(['CONFIRMADA', 'PENDIENTE']),
  critica: z.boolean(),
})
export type ValidationRow = z.infer<typeof ValidationRowSchema>

export const ValidationMatrixSchema = z.object({
  rows: z.array(ValidationRowSchema),
  pending: z.array(z.string()),
})
export type ValidationMatrix = z.infer<typeof ValidationMatrixSchema>

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0

export function buildValidationMatrix(
  inputs: UserInputs,
  hasCharacterImage: boolean,
): ValidationMatrix {
  const row = (
    variable: string,
    value: string,
    fuente: ValidationRow['fuente'],
    critica = true,
  ): ValidationRow => ({
    variable,
    valor: filled(value) ? value : `${CONFIRMACION_REQUERIDA} ${variable}`,
    fuente,
    estado: filled(value) ? 'CONFIRMADA' : 'PENDIENTE',
    critica,
  })

  // El personaje se da por confirmado si hay imagen de referencia: el spec la trata
  // como "fuente de verdad visual" para edad, piel, cabello, facciones y complexión.
  const personaje: ValidationRow = hasCharacterImage
    ? { variable: 'Personaje', valor: 'Imagen de referencia adjunta', fuente: 'REFERENCIA', estado: 'CONFIRMADA', critica: true }
    : row('Personaje', inputs.characterDesc, 'USUARIO')

  const rows: ValidationRow[] = [
    row('Producto', inputs.productName, 'USUARIO'),
    row('Descripción del producto', inputs.productDescription, 'USUARIO'),
    row('Ángulo', inputs.angle, 'USUARIO'),
    row('Público objetivo', inputs.targetAudience, 'USUARIO'),
    row('Problema / deseo', inputs.problem, 'USUARIO'),
    personaje,
    // Fuente USUARIO aunque haya imagen: una foto no confirma origen cultural.
    row('Raza / etnia / origen cultural', inputs.characterEthnicity, 'USUARIO'),
    row('Acento', inputs.accent, 'USUARIO'),
    // La voz es el único campo que el spec marca "SOLO SI ES RELEVANTE".
    { variable: 'Voz', valor: filled(inputs.voice) ? inputs.voice : 'No especificada', fuente: 'USUARIO', estado: 'CONFIRMADA', critica: false },
  ]

  return {
    rows,
    pending: rows.filter((r) => r.estado === 'PENDIENTE').map((r) => r.variable),
  }
}

/** REGLA DE FLUJO: una crítica pendiente detiene el proceso. */
export function canProceed(matrix: ValidationMatrix): boolean {
  return !matrix.rows.some((r) => r.critica && r.estado === 'PENDIENTE')
}

/**
 * Tope del riel del wizard (conveniencia de UI, no el guard real — ver
 * `extract-template/route.ts`). `maxReached` es monótono creciente por diseño (el
 * riel no debe "olvidar" pasos ya vistos), pero eso solo, sin este tope, deja el
 * paso más allá de la validación clickeable aunque la matriz haya vuelto a
 * PENDIENTE: completar la FASE 0, volver a "Personaje", vaciar un campo crítico y
 * reenviar no debe reabrir "Plantilla" en el riel.
 */
export function capMaxReached(maxReached: number, matrix: ValidationMatrix | null, gateStep: number): number {
  const ok = !!matrix && canProceed(matrix)
  return ok ? maxReached : Math.min(maxReached, gateStep)
}
