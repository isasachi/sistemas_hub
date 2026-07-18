/* eslint-disable @next/next/no-img-element */
// Devices del ADN, renderizables por Satori (next/og). Satori implementa un subconjunto de
// CSS y de SVG: soporta flex, border-radius, box-shadow, linear/radial-gradient y <svg> con
// formas básicas (rect, circle, path, polygon, gradientes). NO soporta CSS grid ni backdrop-filter.
//
// Criterio: las formas doradas/glass se hacen con div + gradiente + sombra (dimensional y
// fiable en Satori); solo se usa <svg> donde la geometría lo exige (círculos Mastercard,
// checks, estrellas, iconos de confianza). Los logos de pago son assets de terceros con
// COLORES DE MARCA FIJOS (verificados de brand kits reales), nunca del accent de la campaña.
import type { CSSProperties } from 'react'

// ─── Oro (invariante #4: valor / urgencia / confianza) ───────────────────────
type Gold = { gold: string; goldDark: string }

// Gradiente metálico agresivo: bandas casi-blancas de brillo + oro + sombra profunda → lee
// como lámina de oro pulido, no un fill plano. Reusado por devices Y por el layout de oferta.
export const goldGradient = (gold: string, goldDark: string): string =>
  `linear-gradient(160deg, #FFF7D6 0%, ${gold} 22%, ${goldDark} 50%, ${gold} 74%, #FFF3C8 100%)`

const goldFill = (g: Gold): CSSProperties => ({ backgroundImage: goldGradient(g.gold, g.goldDark) })

// Placa "Recomendado" / "Mejor valor" — corona el tier destacado.
export function GoldRibbon({ label, gold, goldDark }: { label: string } & Gold) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '10px 22px', borderRadius: 999, ...goldFill({ gold, goldDark }),
      color: '#3a2a05', fontWeight: 700, fontSize: 26, letterSpacing: 1,
      textTransform: 'uppercase', boxShadow: '0 6px 16px rgba(0,0,0,0.28)',
      border: '1px solid rgba(255,255,255,0.55)',
    }}>{label}</div>
  )
}

// Cinta "Ahorra X%".
export function SavingsRibbon({ label, gold, goldDark }: { label: string } & Gold) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '8px 18px', borderRadius: 10, ...goldFill({ gold, goldDark }),
      color: '#3a2a05', fontWeight: 700, fontSize: 24,
      boxShadow: '0 4px 12px rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.5)',
    }}>{label}</div>
  )
}

// Medalla circular (garantía, "100%", "48h").
export function GoldSeal({ label, gold, goldDark, size = 150 }: { label: string; size?: number } & Gold) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: 999, ...goldFill({ gold, goldDark }),
      color: '#3a2a05', fontWeight: 700, fontSize: size * 0.24, textAlign: 'center',
      boxShadow: '0 8px 20px rgba(0,0,0,0.3), inset 0 0 0 6px rgba(255,255,255,0.35)',
      border: `3px solid ${goldDark}`,
    }}>{label}</div>
  )
}

// Icono de beneficio: disco de gradiente en accent + símbolo + badge de check verde.
export function CheckDisc({ symbol, accent, size = 88 }: { symbol: string; accent: string; size?: number }) {
  return (
    <div style={{ display: 'flex', position: 'relative', width: size, height: size }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: 999,
        backgroundImage: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.55), ${accent} 62%)`,
        color: '#fff', fontSize: size * 0.42, fontWeight: 700,
        boxShadow: `0 8px 18px ${accent}66`,
      }}>{symbol}</div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'absolute', right: -4, bottom: -4, width: size * 0.34, height: size * 0.34,
        borderRadius: 999, background: '#16a34a', border: '2px solid #fff',
      }}>
        <svg width={size * 0.2} height={size * 0.2} viewBox="0 0 24 24">
          <path d="M20 6L9 17l-5-5" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

// 5 estrellas doradas.
export function Stars({ count = 5, gold = '#F1C15A', size = 34 }: { count?: number; gold?: string; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <path d="M12 2l2.9 6.26L21.6 9.2l-4.8 4.68 1.13 6.6L12 17.3 6.07 20.5l1.13-6.6L2.4 9.2l6.7-.94z"
            fill={gold} stroke="#c99a2e" strokeWidth="0.6" />
        </svg>
      ))}
    </div>
  )
}

// ─── Iconos de confianza (color parametrizable) ──────────────────────────────
type IconProps = { color?: string; size?: number }
const stroke = (color: string) => ({ fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })

export function ShieldIcon({ color = '#334155', size = 40 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z" {...stroke(color)} /><path d="M9 12l2 2 4-4" {...stroke(color)} /></svg>
}
export function TruckIcon({ color = '#334155', size = 40 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M1 5h13v10H1zM14 8h4l3 3v4h-7z" {...stroke(color)} /><circle cx="6" cy="17" r="2" {...stroke(color)} /><circle cx="18" cy="17" r="2" {...stroke(color)} /></svg>
}
export function ClockIcon({ color = '#334155', size = 40 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" {...stroke(color)} /><path d="M12 7v5l3 2" {...stroke(color)} /></svg>
}
export function LockIcon({ color = '#334155', size = 40 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" {...stroke(color)} /><path d="M8 11V8a4 4 0 018 0v3" {...stroke(color)} /></svg>
}

// ─── Logos de pago (colores de marca FIJOS, verificados) ─────────────────────
// Yape #5A0E6F + teal #00D1A9 · Mercado Pago #00B1EA · Visa #1A1F71 · Mastercard #EB001B/#F79E1B.
const logoBox: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }

export function YapeLogo({ w = 108, h = 62 }: { w?: number; h?: number }) {
  return (
    <div style={{ ...logoBox, width: w, height: h, background: '#5A0E6F', position: 'relative' }}>
      <span style={{ color: '#fff', fontSize: h * 0.44, fontWeight: 700, letterSpacing: -0.5 }}>Yape</span>
      <div style={{ display: 'flex', position: 'absolute', top: 8, right: 10, width: 10, height: 10, borderRadius: 999, background: '#00D1A9' }} />
    </div>
  )
}

export function MercadoPagoLogo({ w = 108, h = 62 }: { w?: number; h?: number }) {
  return (
    <div style={{ ...logoBox, width: w, height: h, background: '#00B1EA', flexDirection: 'column', gap: 2 }}>
      {/* handshake simplificado (corazón de dos manos) en blanco */}
      <svg width={h * 0.42} height={h * 0.42} viewBox="0 0 24 24">
        <path d="M12 20s-7-4.35-7-9a4 4 0 017-2.65A4 4 0 0119 11c0 4.65-7 9-7 9z" fill="#fff" />
      </svg>
      <span style={{ color: '#fff', fontSize: h * 0.19, fontWeight: 700 }}>Mercado Pago</span>
    </div>
  )
}

export function VisaLogo({ w = 108, h = 62 }: { w?: number; h?: number }) {
  return (
    <div style={{ ...logoBox, width: w, height: h, background: '#fff' }}>
      <span style={{ color: '#1A1F71', fontSize: h * 0.4, fontWeight: 700, fontStyle: 'italic', letterSpacing: 1 }}>VISA</span>
    </div>
  )
}

export function MastercardLogo({ w = 108, h = 62 }: { w?: number; h?: number }) {
  const r = h * 0.3
  return (
    <div style={{ ...logoBox, width: w, height: h, background: '#fff', flexDirection: 'column', gap: 3 }}>
      <svg width={r * 3.4} height={r * 2} viewBox="0 0 60 36">
        <circle cx="22" cy="18" r="18" fill="#EB001B" />
        <circle cx="38" cy="18" r="18" fill="#F79E1B" />
        <path d="M30 5a18 18 0 000 26 18 18 0 000-26z" fill="#FF5F00" />
      </svg>
      <span style={{ color: '#232323', fontSize: h * 0.15, fontWeight: 700 }}>mastercard</span>
    </div>
  )
}

// Banderas (proporción 3:2). PE = rojo/blanco/rojo vertical; US = rayas simplificadas + cantón.
export function FlagPE({ h = 28 }: { h?: number }) {
  const w = h * 1.5
  return (
    <div style={{ display: 'flex', width: w, height: h, borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.15)' }}>
      <div style={{ display: 'flex', width: w / 3, height: h, background: '#D91023' }} />
      <div style={{ display: 'flex', width: w / 3, height: h, background: '#fff' }} />
      <div style={{ display: 'flex', width: w / 3, height: h, background: '#D91023' }} />
    </div>
  )
}
export function FlagUS({ h = 28 }: { h?: number }) {
  const w = h * 1.5
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, height: h, borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.15)', position: 'relative' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', width: w, height: h / 6, background: i % 2 ? '#fff' : '#B22234' }} />
      ))}
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: w * 0.4, height: h * 0.54, background: '#3C3B6E' }} />
    </div>
  )
}
