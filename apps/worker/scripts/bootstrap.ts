// Bootstrap para los scripts CLI (scrape/analyze). NO se usa en Next/Vercel.
// Debe importarse PRIMERO en cada script.
//
// 1. Carga .env.local (local) y .env. En CI las vars vienen de los secrets.
// 2. Polyfill de WebSocket: el cliente de Supabase exige WebSocket para su canal
//    realtime y Node < 22 no lo trae nativo. Las rutas de Vercel no lo necesitan
//    (su runtime ya lo provee), por eso el polyfill vive solo aquí.
import { config } from 'dotenv'
import ws from 'ws'

config({ path: '.env.local' })
config()

const g = globalThis as unknown as { WebSocket?: unknown }
if (!g.WebSocket) g.WebSocket = ws
