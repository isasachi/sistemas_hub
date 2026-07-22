# Fase 6 — Paralelización y progreso real

**Objetivo:** generar las 8 secciones concurrentemente, con progreso visible y
reanudable, sin depender de que el usuario deje la pestaña abierta.

**Precondición:** Fases 2, 3 y 4 completas. Sin esto la paralelización produce
deriva visual — es el invariante #2.

**Checkpoint humano:** no.

---

## El problema

El cliente llama `sessions/[id]/section/[type]` **secuencialmente**, una vez por
sección. Con `maxDuration = 60` por llamada, ocho secciones son ocho round-trips
serializados. Si el usuario cierra la pestaña, la sesión queda a medias.

Hasta la Fase 4 esto era *necesario*: el ancla se derivaba de la primera sección.
Ya no lo es.

## La restricción de Vercel

Un job de servidor largo no es viable: no hay proceso persistente y las
serverless functions tienen techo de duración. Las dos rutas realistas:

- **A — Concurrencia desde el cliente.** El cliente dispara las 8 llamadas en paralelo
  con un límite de concurrencia. Cada una sigue siendo una invocación corta.
  Cero infra nueva.
- **B — Cola con worker en el VPS.** Encolar en Supabase, procesar en el worker
  que ya existe. Robusto y verdaderamente desacoplado del cliente, pero es infra nueva.

**Empezá por A.** Con producto, marca y talento ya canónicos, A da el 90% del beneficio
sin tocar el despliegue. Pasá a B solo si el usuario reporta pérdidas por cerrar la pestaña.

---

## Commits

### C6.1 — Estado por sección en DB

`sections` ya guarda `status: 'pending' | 'done'`. Agregar `'generating'` y `'error'`,
más `attempts` y `updated_at` por sección. Esto es lo que hace la sesión reanudable:
al reabrirla, el cliente ve qué falta y reanuda solo eso.

### C6.2 — Concurrencia en el cliente

En el wizard, disparar las secciones pendientes con límite de concurrencia **3**
(no 8: hay rate limits de Gemini y el contexto de imagen es pesado).

Reintentar automáticamente las que fallen, hasta 2 veces, antes de marcar `'error'`.

### C6.3 — Progreso real

Barra de progreso por sección con su estado. Las imágenes aparecen a medida que
terminan, en el orden en que terminan, no en orden de sección.

### C6.4 — Reanudación

Al abrir `sesion/[id]`, si hay secciones `'pending'` o `'error'`, ofrecer
**Reanudar generación**. Solo genera las que faltan.

### C6.5 — Cuota, revisada

`lib/gen-quota` hoy gatea con "1 gen + 3 regens por step". Eso tenía sentido cuando
toda regeneración costaba una imagen. En híbrido hay dos costos distintos:

- **Regen de escena** — caro. Mantener la cuota actual.
- **Regen de composición** (cambió el copy, un precio, un color) — $0. **Ilimitado.**

Hoy le cobrás al usuario una de sus 3 regeneraciones por corregir una coma.

---

## Criterio de aceptación

1. Las 8 secciones se generan en aproximadamente el tiempo de la más lenta, no en la suma.
2. Cerrar la pestaña a mitad y reabrir permite reanudar sin perder lo generado.
3. Una sección que falla no bloquea a las otras 7.
4. Cambiar el copy y re-renderizar no consume cuota.
