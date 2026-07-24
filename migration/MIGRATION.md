# MIGRACIÓN — generador-landing → motor híbrido con ADN maestro

> **Leé este archivo completo al empezar CADA sesión, antes de tocar código.**
> Después abrí solo el archivo de la fase que estés ejecutando.

---

## 1. Qué es esto

`generador-landing` genera landings direct-response como **secciones-imagen 9:16
independientes**. Hoy cada sección es una imagen generada íntegra por
`gemini-3.1-flash-image`, **con el copy incrustado por el modelo**.

Esta migración cambia esa premisa por una arquitectura **híbrida**:

- **Gemini genera la ESCENA** — fondo atmosférico, producto, beneficiario. Sin una sola letra.
- **El código compone el TEXTO y la UI** — headlines, tiers de precio, cards glass,
  sellos, logos de pago — con Satori (`next/og`), determinista y editable.

---

## 2. Por qué

El motor actual le pide a un modelo de difusión que renderice texto exacto,
precios exactos y logos de marca. Eso no se arregla con mejores prompts.

Evidencia dentro del propio proyecto:

- `TEXT_RULES` en `instructions.ts` son 4 reglas cuyo único propósito es evitar
  que el modelo escriba palabras de instrucción en la imagen. Son contención, no diseño.
- `SectionCopySchema` usa `.max()` como "primera línea de defensa contra texto
  largo ilegible". El schema está deformado por una limitación del renderer.
- Las 4 referencias CLEARSTEM de las que se destiló el ADN **tienen el texto roto**
  ("develusion garantzeda", "s/s99", precios inconsistentes entre piezas).
- Los logos de Yape / Mercado Pago / Visa son estructuralmente imposibles por difusión,
  y son el núcleo del ADN de confianza para el mercado peruano.

Beneficio colateral grande: **cambiar un precio o un headline deja de costar una
generación de imagen**. Hoy son hasta 32 generaciones por landing (8 secciones ×
1 gen + 3 regens). Después, las regeneraciones de copy cuestan $0 y son instantáneas.

---

## 3. Invariantes — NO NEGOCIABLES

Estas reglas no se discuten en ninguna fase. Si una tarea parece requerir
violarlas, la tarea está mal planteada: **pará y preguntá**.

1. **La IA nunca renderiza texto en secciones migradas.** Todo texto visible sale
   de la capa de composición. El prompt de escena debe pedir explícitamente
   `no text, no lettering, no typography, no watermarks`.
2. **Todo lo canónico se resuelve ANTES de paralelizar.** Producto canónico (F2),
   marca derivada (F3) y talento canónico (F4) se fijan una vez por sesión y se
   persisten. Recién ahí se pueden generar N escenas en paralelo sin deriva visual.
3. **La tipografía se elige de un catálogo cerrado (enum de Zod), nunca texto libre.**
   Un nombre de fuente inventado por el LLM es una fuente que no está bundleada.
4. **El dorado es exclusivamente para valor / urgencia / confianza.** Regla heredada
   del ADN actual (`DESIGN_SYSTEM`) y se mantiene en la capa compuesta.
5. **Regla de costo del proyecto: todo el LLM es Gemini.** Anthropic solo en el worker.
   Ninguna fase introduce llamadas a Anthropic en la app.
6. **Ninguna fase rompe sesiones existentes.** Toda columna nueva es nullable, todo
   schema nuevo convive con el viejo detrás de un flag hasta que la fase se aprueba.
7. **Ninguna migración de DB borra ni renombra columnas.** Solo `add column if not exists`.

---

## 4. Restricciones del entorno

| Restricción | Implicación |
|---|---|
| Desplegado en **Vercel** | No hay Playwright. La composición va con **Satori / `next/og`**. |
| Satori no soporta `backdrop-filter` | El glassmorphism se simula. Ver `fases/00-composicion.md`. |
| Satori soporta **flexbox, no CSS grid** | Los layouts se escriben en flex o posición absoluta. |
| Satori necesita las fuentes como `ArrayBuffer` | Los `.ttf` van en el repo + `outputFileTracingIncludes` en `next.config`. |
| `maxDuration` en rutas de sección | Hoy 60s. La paralelización es **client-side concurrente**, no un job largo. |
| `lib/gemini.ts` inyecta `SPANISH_RULE` en el choke point | Sigue aplicando a escenas. Irrelevante una vez que la escena no tiene texto. |

---

## 5. Convivencia vieja/nueva

Cada sección migrada se marca en un registry:

```ts
// lib/landing/engine-registry.ts
export const HYBRID_SECTIONS: Set<SectionType> = new Set([]) // se va llenando por fase
```

La ruta `sessions/[id]/section/[type]` bifurca según ese set. Una sección no
migrada sigue usando `buildSectionInstruction` exactamente como hoy.
**Esto permite abortar cualquier fase sin romper el producto.**

---

## 6. Fases

| # | Archivo | Objetivo | Checkpoint humano |
|---|---|---|---|
| 0 | `fases/00-composicion.md` | Infra Satori: fuentes, glass, SVG devices, `renderComposite` | No |
| 1 | `fases/01-piloto-oferta.md` | Migrar la sección Oferta a híbrido | **SÍ — bloqueante** |
| 2 | `fases/02-producto-canonico.md` | Ancla desde la foto real, no desde el render | No |
| 3 | `fases/03-derived-brand.md` | Paleta + tipografía + casting derivados del producto | **SÍ — bloqueante** |
| 4 | `fases/04-talento-canonico.md` | Una sola persona por campaña | **SÍ — bloqueante** |
| 5 | `fases/05-adn-oferta-confianza.md` | Schemas de oferta, TrustBlock, validador cruzado | No |
| 6 | `fases/06-paralelizacion.md` | Generación concurrente + progreso real | No |
| 7 | `fases/07-multiformato.md` | 4:5 y 1:1 desde la misma escena | No |

**Las fases se ejecutan en orden.** Las Fases 1, 3 y 4 terminan en un juicio
estético humano, no en un test. No avances sin aprobación explícita del usuario.

---

## 7. Cómo trabajar cada fase

1. Leé el archivo de la fase completo antes de escribir código.
2. Ejecutá los commits **en el orden listado**. Un commit = un cambio revisable y reversible solo.
3. Al terminar, verificá el **criterio de aceptación** de la fase.
4. Si la fase tiene checkpoint humano: parás, mostrás el resultado, esperás.
5. No adelantes trabajo de fases siguientes "de paso". Si ves algo, anotalo y seguí.

---

## 8. Glosario

- **ADN** — el sistema destilado de 4 referencias DR reales (CLEARSTEM), en 4 dimensiones:
  **visual** (atmósfera luminosa, glass, dorado-para-valor), **copy** (fórmulas de titular),
  **oferta** (3 tiers, decoy, precio ancla, costo por unidad, urgencia),
  **confianza** (contraentrega, medios de pago locales, plazos, garantía).
- **Escena** — la imagen generada por Gemini: fondo + producto + beneficiario. Sin texto.
- **Composición** — la capa de texto/UI renderizada por Satori sobre la escena.
- **Canónico** — un asset resuelto una vez por sesión y reusado en todas las secciones.
