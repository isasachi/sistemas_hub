/**
 * Los roles como DATOS puros: sin Supabase ni `next/headers`, así un componente
 * cliente (Acciones.tsx) puede importar la lista y las etiquetas sin arrastrar el
 * cliente de servicio al bundle. La lógica que lee la DB vive en `roles.ts`, que
 * re-exporta esto.
 */
export const ROLES = ['admin', 'gestor', 'operador'] as const
export type Role = (typeof ROLES)[number]
/** Los roles que entran al panel de usuarios. */
export type PanelRole = Exclude<Role, 'operador'>

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  operador: 'Operador',
}

/** Normaliza cualquier entrada. Lo que no sea un rol conocido es 'operador', nunca uno privilegiado. */
export function toRole(v: unknown): Role {
  return (ROLES as readonly unknown[]).includes(v) ? (v as Role) : 'operador'
}

export const puedeEntrarAlPanel = (r: Role | null | undefined): r is PanelRole =>
  r === 'admin' || r === 'gestor'

/** Solo el admin. Un gestor que tocara roles podría ascenderse a sí mismo. */
export const puedeCambiarRoles = (r: Role | null | undefined): boolean => r === 'admin'
