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
 * SEIS variables críticas y ninguna más: producto, descripción del producto, ángulo,
 * público objetivo, problema/deseo y personaje.
 *
 * El PERSONAJE se toma SIEMPRE de la imagen de referencia y nunca se infiere: por eso
 * su única fuente válida es la foto, y sin foto la fila queda PENDIENTE y el flujo se
 * detiene. Las tres filas que había antes —etnia, acento y voz— ya no se le piden al
 * usuario: la etnia se lee del personaje sin declararla aparte, el acento lo infiere
 * la FASE 4 del mismo personaje y la voz es uno de los cuatro perfiles estándar
 * (`VOZ_ESTANDAR`, character.ts). Sus columnas siguen en la tabla, sin lector
 * (precedente de `ph_user_seen`).
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

  // El personaje SOLO puede venir de la imagen: es la fuente de verdad visual de edad,
  // piel, cabello, facciones y complexión, y describirlo con palabras sería inferirlo.
  const personaje: ValidationRow = hasCharacterImage
    ? { variable: 'Personaje', valor: 'Imagen de referencia adjunta', fuente: 'REFERENCIA', estado: 'CONFIRMADA', critica: true }
    : { variable: 'Personaje', valor: `${CONFIRMACION_REQUERIDA} foto del personaje`, fuente: 'REFERENCIA', estado: 'PENDIENTE', critica: true }

  const rows: ValidationRow[] = [
    row('Producto', inputs.productName, 'USUARIO'),
    row('Descripción del producto', inputs.productDescription, 'USUARIO'),
    row('Ángulo', inputs.angle, 'USUARIO'),
    row('Público objetivo', inputs.targetAudience, 'USUARIO'),
    row('Problema / deseo', inputs.problem, 'USUARIO'),
    personaje,
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
