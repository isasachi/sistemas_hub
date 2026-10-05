# Landing Generator v2 — plan (Fase 0)

Rama `feat/landing-generator-v2` desde `main` @ `fd33ad1`. Sin código todavía.

## Decisiones tomadas (2026-10-05)

- **1 → AI SDK (`ai` 7, `@ai-sdk/react`, `@ai-sdk/google`, `@ai-sdk/openai`), alcance (b):** el
  agente del chat es un `ToolLoopAgent` y TODO el núcleo de texto v2 (análisis, copy, brief) sale
  por `generateText` + `Output.object`. Par: `gemini-3.6-flash` → `gpt-5.4-nano`, el mismo del
  hub, con keys `GOOGLE_API_KEY` / `OPENAI_API_KEY` y sin Gateway. Los schemas v2 se diseñan
  compatibles con OpenAI strict DESDE EL ORIGEN (todo `required`, opcionales `.nullable()`), así
  que el mismo schema es plano para Gemini y válido para OpenAI sin `toStrictSchema`.
  La IMAGEN sigue por `generateImage(…, { respaldo: NANO_BANANA_PRO })`, ya que el AI SDK no
  tiene respaldo por pieza.
- 2, 3, 4, 5, 8, 9 y 10 → como se recomendaron abajo.
- **4 (ii):** tapar las líneas "Ej:" de los PNG requiere coordenadas por línea (OCR). No se hace:
  la red es el verificador determinista y la instrucción explícita de que todo "Ej:" es notación.
- **6:** partículas y props se apagan con la constante `PROPS_PARTICLES = false` en el núcleo.
- **7:** los recursos quedan en el servidor, en `apps/web/lib/landing-v2/knowledge/`. Solo los
  importa código de servidor, así que nunca llegan al bundle del cliente.

## Decisiones que se pidieron (histórico)

Cada una choca con la arquitectura real o con doctrina medida del repo. Va con mi recomendación.

1. **Agente del chat sin Vercel AI SDK.** El repo no tiene `ai` ni `@ai-sdk/*`; el texto va por
   `callStructured` (Gemini 3.6 flash → gpt-5.4-nano). **Recomiendo:** máquina de estados en servidor.
   Por turno, UNA llamada `callStructured` que devuelve `{intent, inputsExtraidos, feedback, seccion, respuesta}`
   y el código ejecuta la transición (update_inputs / analyze / generate / revise / approve). El servidor
   rechaza generar si faltan inputs: lo hace por construcción, no confía en el modelo. Sin deps nuevas, se
   porta tal cual a un backend aparte y respeta "el modelo redacta, el código verifica".
   *Alternativa:* instalar `ai` + `ToolLoopAgent` — dep de IA nueva, segundo cableado de proveedores paralelo a `lib/gemini.ts`.

2. **1080x1920 no se puede pedir directo.** El modelo de imagen devuelve 400 (lados múltiplos de 16, `llm-openai.ts:42`).
   **Recomiendo:** pedir 9:16 (sunburst → 864x1536; respaldo Google → 1152x2048) y reescalar a 1080x1920 con
   `sharp` (ya está). Como el reescalado borra la huella del tamaño, cada render guarda qué modelo respondió.

3. **Sin paso de talento no hay ancla de identidad.** Hoy la placa canónica es la cara que se repite entre
   secciones; sin ella, la persona cambia en cada sección. Además, los encuadres de cuerpo sin rostro por
   sunburst se moderan 4 de 4 (por eso existía la placa de zona). Opciones:
   - (a) v2 sin personas;
   - (b) personas por sección aceptando que la cara varíe;
   - (c) **recomendada:** `analyzeProduct` decide si la dirección de arte lleva persona y, si sí, genera la
     placa canónica en automático (reusa `talent.ts`), sin paso de UI. Los encuadres de cuerpo sin rostro quedan prohibidos en el brief.

4. **Los wireframes traen ejemplos con forma de valor** ("+10,000 clientes satisfechos • 4.8/5 estrellas",
   "Garantía X días", "Envío gratis • Pago contra entrega", "Últimas unidades • Precio por tiempo limitado").
   Ley del repo pagada 6 veces: el modelo los devuelve como contenido. **Recomiendo:**
   - (i) **Verificador determinista del copy:** toda cifra, %, estrella o término de
     garantía/envío/contra entrega/urgencia tiene que existir en los inputs. Si no existe, se reintenta y
     luego se borra (modelo: `pinUserPrice` / `auditar-precios`).
   - (ii) **Tapar las líneas "Ej: …" en los PNG** antes de mandarlos. Sigo sin saber si quieres esto.

   Lo mismo con los ejemplos de CTA del system prompt ("Quiero mi descuento"). El prompt lo dejo **literal**,
   como pediste; el verificador es la red.

5. **Créditos.** Cada render y cada "pedir cambios" pasa por `checkGenQuota` / `recordGenQuota` con kind
   `landing-section:<id>`: cobra igual que v1. Dos consecuencias:
   - `GEN_PER_STEP_LIMIT=4` limita los cambios por sección.
   - Los turnos del chat son llamadas a LLM, así que llevan su propio kind de cuota (sin costo en créditos,
     como copy/classify hoy). Sin eso, el chat es un endpoint gratis de LLM.

   ¿Confirmas que 14 secciones = hasta 14 créditos?

6. **`ENABLE_PROPS_PARTICLES` como env var** choca con "NO HAY ESCAPES GLOBALES" (AGENTS.md). **Recomiendo:**
   constante en código (`PROPS_PARTICLES = false` en el núcleo). La lógica de v1 queda intacta.

7. **Dónde viven los PDFs.** El Root Directory de Vercel es `apps/web` y los recursos se leen por
   `process.cwd()`: un `knowledge/` en la raíz no viaja en el bundle de la función. **Recomiendo:**
   - Los PDFs, en `knowledge/landing/` de la raíz, como pediste (fuente).
   - Los 14 PNG y el `.md` del checklist, en `apps/web/lib/landing-v2/knowledge/`, generados por un script
     versionado (`scripts/landing-v2-knowledge.mjs`: `pdfimages` → PNG 1024x1536 → JPEG comprimido).

   Las imágenes ya vienen embebidas a 1024x1536, así que no hace falta re-renderizar.

8. **Extracción de PDF/Word.** No hay dep para esto. **Recomiendo:** `unpdf` + `mammoth`, que son deps nuevas
   pero NO de IA. `.doc` se rechaza con mensaje pidiendo `.docx` o PDF. Hay un tope de body de 4,5 MB en
   Vercel: tope de archivo 4 MB, o subida firmada (`createSignedUpload`, ya existe) si quieres más.
   *Alternativa:* que Gemini lea el PDF inline. Cuesta una llamada, tiende a resumir y no lee `.docx`.

9. **Persistencia.** Tabla nueva `landing_v2_sessions` (`id`, `user_id`, `session jsonb`, `messages jsonb`,
   timestamps; RLS sin policies como v1). Los 14 ids no caben en el enum ni en las columnas de v1. **La
   migración a prod la aplico solo con tu OK.**

10. **Ruteo y v1.** El selector Wizard/Chat elige entre las dos vistas de **v2** (`/tools/generador-landing/v2?view=wizard|chat`).
    ¿El wizard v1 (`/wizard`) sigue accesible desde la intro hasta que v2 esté validado? **Recomiendo:** sí,
    como link secundario "versión anterior".

## Reconocimiento (resumen)

- **Wizard v1:**
  - `components/tools/generador-landing/LandingWizard.tsx` sobre `components/tools/ui/StepWizard.tsx`.
  - Pasos: Producto → Fotos → Identidad (classify + DNA + talento) → Confianza → Secciones + copy → Preview/render.
  - Estado: zustand `store/landing.ts` sin persist. El id va en localStorage y la fila en `landing_sessions`.
- **IA:** todo en servidor, por `lib/gemini.ts`.
  - Copy, classify y DNA: `callStructured`. Caja del producto: `geminiCallStructured` (sin respaldo).
  - Render: `generateImage(parts, 3, {aspectRatio:'9:16', respaldo: NANO_BANANA_PRO})`; el regen con prompt va por `editWithPrompt`.
  - Las keys solo existen en servidor.
- **Storage:** bucket `ad-uploads`, `uploadToStorage(sessionId, …)` con paths deterministas y URL pública.
  Las fotos suben multipart a `/photos`.
- **Auth:** `readUserId()` (usuario de Supabase o cookie `ph_uid`); el layout `(app)` exige login + Whop.
- **Cuota:** `lib/gen-quota.ts` + `lib/credits.ts`. Solo `landing-section:*` gasta créditos.
- **Deps:** `zod 4`, `zustand 5`, `@google/genai`, `openai`, `sharp`. No hay chat UI en el hub.

## Arquitectura

```
apps/web/lib/landing-v2/            núcleo — sin React ni next/*
  system-prompt.ts                  el JSON de la sección 8, literal
  catalog.ts                        14 secciones: id, ES/EN, página wf, bloque checklist, cta, requiere
  knowledge/wf-01..14.jpg, cro-checklist.md
  schemas.ts                        LandingInputs, VisualSystem, LandingSession (zod, serializable)
  extract-document.ts               unpdf / mammoth
  analyze.ts                        analyzeProduct → VisualSystem (paleta derivada en código, reusa extract-dna / palette-derive)
  section.ts                        generateSectionCopy, buildRenderBrief, renderSection, reviseSection
  verify-copy.ts                    verificador de cifras/claims contra inputs (decisión 4)
  flow.ts                           approve, getNextSection, missingInputs, gating de soporte de datos
  chat.ts                           máquina de estados del chat (decisión 1)
  db.ts                             landing_v2_sessions
apps/web/app/api/landing-v2/...     rutas delgadas: validar → núcleo → json
apps/web/app/(app)/tools/generador-landing/v2/page.tsx   selector + WizardV2 | ChatV2
apps/web/components/tools/landing-v2/                    WizardV2 (reusa StepWizard, FileUpload, FieldGroup…), ChatV2
```

Reglas que el núcleo hereda de la doctrina de landing:

- **El texto que se dibuja está en lista blanca.** El código arma el prompt final: los campos de layout del
  brief + las casillas de copy entrecomilladas, verbatim y pasadas por `limpiarCopy`. Así el brief del modelo
  no termina impreso en la imagen.
- **El modelo observa, el código decide la paleta.** `VisualSystem.palette` sale de
  `polarityFromPackage` / `derivePalette`; el modelo no elige hex.
- **El wireframe gris no se manda nunca al modelo de imagen.** Solo va al de razonamiento, y solo la página de
  esa sección más su bloque del checklist.
- **Mapeo del checklist (no es 1:1):**
  - Beneficios inmediatos y ampliados → checklist #5.
  - Segmentación, ingredientes y cómo usarlo no tienen bloque propio → solo la regla del wireframe.
  - Urgencia, garantía, FAQ y confianza transversal → donde dice el system prompt, y solo con datos.
- **Gating de datos:** `testimonials` exige testimonios en la investigación y `before_after` exige imágenes
  reales. Sin eso, se marca la advertencia y se sugiere la sección compatible más cercana.

## Fases / commits

1. `knowledge`: PDFs, script, PNG/JPEG y checklist `.md` + `catalog.ts` + test del orden.
2. Núcleo + migración (sin aplicar) + rutas + tests: generar bloqueado sin inputs, verificador de copy, `getNextSection`.
3. Página v2 + selector (localStorage + `?view=`, aviso de sesión nueva al cambiar).
4. Wizard v2 (7 pasos de la sección 5 del prompt).
5. Chat v2 (home centrado → conversación, slot vacío en la barra, imágenes inline con lightbox y descarga, polling de estado).
6. Probe real: 1 producto, ≥2 draws de hero + oferta + una sección tardía, mirando consistencia y qué modelo respondió.
   "Las primeras aprobadas fijan el sistema" no está medido con 14 secciones.

## Riesgos

- **Consistencia en 14 secciones** usando las aprobadas como referencia: sin medir (fase 6).
- **Tiempo de render:** ~15 s con sunburst, ~22 s con pro, más copy y brief. Una sección por request, `maxDuration = 300`.
- **Costo:** hasta 14 créditos por landing, más revisiones (decisión 5).
- **El brief como vector de fuga de texto:** mitigado con la lista blanca armada en código.
