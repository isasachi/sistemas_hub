// @ph/shared — capa de datos compartida entre apps/web (Vercel) y apps/worker (VPS).
// SOLO debe contener la capa DB + tipos/utilidades puras. Prohibido importar
// Next/React (rompería el worker) o Playwright/Anthropic (rompería la regla de
// costo: Vercel no puede tener acceso a esos módulos).
export * from './types'
export * from './json-clean'
export * from './prescore'
export * from './keywords'
export * from './db'
