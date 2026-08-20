'use server'

/**
 * Mutaciones de "Mi cuenta". Server actions y no rutas de API: el repo ya usa ese
 * patrón para el login (`app/actions/auth.ts`), y así los formularios no necesitan
 * fetch, JSON ni manejar estado a mano — `useActionState` alcanza.
 *
 * ⚠️ CADA ACCIÓN RESUELVE LA SESIÓN POR SU CUENTA y escribe sobre `user.id`, nunca
 * sobre un id que venga del formulario. Un action es un endpoint público: si el
 * usuario objetivo saliera del cliente, cualquiera podría escribirle el perfil (o
 * la API key de KIE) a cualquier cuenta.
 */
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/supabase/server'
import { saveProfile, setKieKey } from '@/lib/user-settings'
import { uploadToStorage } from '@/lib/storage'

export type FormState = { error?: string; ok?: string }

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? '').trim()

/** Tope de largo por campo. Corta antes de la DB para dar un mensaje entendible. */
function largo(valor: string, max: number, nombre: string): string | null {
  return valor.length > max ? `${nombre} no puede pasar de ${max} caracteres.` : null
}

/**
 * RUC (11 dígitos) o DNI (8). Solo se valida cuando el valor es TODO dígitos: un
 * cliente extranjero tiene identificadores con letras y bloquearlo sería inventar
 * una regla que SUNAT no pide. Un RUC mal escrito, en cambio, es un comprobante
 * que no se puede emitir, así que ese caso sí se ataja.
 */
function validarDocumento(valor: string): string | null {
  if (!valor || !/^\d+$/.test(valor)) return null
  if (valor.length !== 8 && valor.length !== 11) {
    return 'Un DNI tiene 8 dígitos y un RUC 11. Revisa el número.'
  }
  return null
}

export async function guardarPerfil(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const fullName = texto(fd, 'fullName')
  const phone = texto(fd, 'phone')
  const problema = largo(fullName, 80, 'El nombre') ?? largo(phone, 30, 'El teléfono')
  if (problema) return { error: problema }

  try {
    await saveProfile(user.id, { fullName, phone })
  } catch (err) {
    console.error('[cuenta] perfil:', err instanceof Error ? err.message : String(err))
    return { error: 'No pudimos guardar tus datos. Inténtalo de nuevo.' }
  }
  revalidatePath('/cuenta')
  return { ok: 'Datos guardados.' }
}

export async function guardarFacturacion(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const billingName = texto(fd, 'billingName')
  const taxId = texto(fd, 'taxId')
  const billingAddress = texto(fd, 'billingAddress')
  const problema =
    largo(billingName, 120, 'La razón social') ??
    largo(taxId, 20, 'El documento') ??
    largo(billingAddress, 200, 'La dirección') ??
    validarDocumento(taxId)
  if (problema) return { error: problema }

  try {
    await saveProfile(user.id, { billingName, taxId, billingAddress })
  } catch (err) {
    console.error('[cuenta] facturación:', err instanceof Error ? err.message : String(err))
    return { error: 'No pudimos guardar tus datos de facturación. Inténtalo de nuevo.' }
  }
  revalidatePath('/cuenta')
  return { ok: 'Datos de facturación guardados.' }
}

export async function guardarKieKey(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const key = texto(fd, 'key')
  // Una key de KIE son ~40 caracteres; el tope es defensivo, no una validación
  // de formato (no conocemos el formato exacto y rechazar una key buena sería peor).
  if (key.length > 200) return { error: 'Esa key es demasiado larga.' }

  try {
    await setKieKey(user.id, key)
  } catch (err) {
    console.error('[cuenta] kie key:', err instanceof Error ? err.message : String(err))
    return { error: 'No pudimos guardar la key. Inténtalo de nuevo.' }
  }
  revalidatePath('/cuenta')
  return { ok: key ? 'Key guardada.' : 'Key eliminada.' }
}

/**
 * Formatos aceptados para la foto de perfil.
 *
 * ⚠️ EL BUCKET NO VALIDA NADA. `ad-uploads` es público, con `file_size_limit` null
 * y `allowed_mime_types` null (verificado contra el proyecto). Y `mimeToExt` cae a
 * `.jpg` para cualquier tipo desconocido, así que un archivo arbitrario terminaría
 * guardado como imagen en una URL pública. El allowlist y el tope tienen que estar
 * acá, antes de tocar el storage.
 */
const TIPOS_AVATAR = ['image/png', 'image/jpeg', 'image/webp']
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export async function subirAvatar(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const file = fd.get('avatar')
  if (!(file instanceof File) || file.size === 0) return { error: 'Elige una imagen.' }
  if (!TIPOS_AVATAR.includes(file.type)) {
    return { error: 'La foto tiene que ser PNG, JPG o WEBP.' }
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: 'La foto no puede pesar más de 2 MB.' }
  }

  try {
    // Path determinista (`avatars/<user.id>.<ext>`) + upsert: cambiar la foto pisa
    // los bytes anteriores en vez de dejar objetos sueltos. `uploadToStorage` le
    // agrega `?v=<ts>` a la URL, que es lo que hace que el navegador deje de servir
    // la foto vieja cacheada — el mismo cache-bust que ya usa video-ads.
    const buffer = Buffer.from(await file.arrayBuffer())
    const url = await uploadToStorage('avatars', buffer, file.type, user.id)
    await saveProfile(user.id, { avatarUrl: url })
  } catch (err) {
    console.error('[cuenta] avatar:', err instanceof Error ? err.message : String(err))
    return { error: 'No pudimos subir la foto. Inténtalo de nuevo.' }
  }
  revalidatePath('/cuenta')
  // El avatar también se pinta en la barra del panel, que vive en otro layout.
  revalidatePath('/', 'layout')
  return { ok: 'Foto actualizada.' }
}

export async function quitarAvatar(): Promise<void> {
  const user = await getUser()
  if (!user) return
  // Se borra la referencia, no el objeto del bucket: el path es determinista, así
  // que la próxima subida lo pisa igual. Un delete extra sería una llamada de red
  // más para el mismo resultado.
  await saveProfile(user.id, { avatarUrl: null })
  revalidatePath('/cuenta')
  revalidatePath('/', 'layout')
}
