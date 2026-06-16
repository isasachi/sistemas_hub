import { describe, it, expect } from 'vitest'
import { makeRateController } from '@/lib/product-hunter/scraper'

// Reloj inyectable: avanzamos el tiempo a mano para testear el cool-down sin timers.
function fixedClock(start = 0) {
  const c = { t: start }
  return { now: () => c.t, advance: (ms: number) => { c.t += ms } }
}

const CFG = { streakLimit: 3, cooldownMs: 1000 }

describe('makeRateController', () => {
  it('no dispara cool-down con 0-payloads dispersos (un hit resetea la racha)', () => {
    const clk = fixedClock()
    const rc = makeRateController({ ...CFG, now: clk.now })
    rc.note(0); rc.note(0); rc.note(5)  // hit antes de llegar al límite
    rc.note(0); rc.note(0)
    expect(rc.gateMs()).toBe(0)
  })

  it('dispara cool-down tras streakLimit 0-payloads consecutivos', () => {
    const clk = fixedClock()
    const rc = makeRateController({ ...CFG, now: clk.now })
    rc.note(0); rc.note(0)
    expect(rc.gateMs()).toBe(0)
    rc.note(0)  // 3º consecutivo → dispara
    expect(rc.gateMs()).toBe(1000)
  })

  it('invoca onCooldown con los segundos al disparar', () => {
    const clk = fixedClock()
    const rc = makeRateController({ ...CFG, now: clk.now })
    let seconds = -1
    rc.onCooldown = (s) => { seconds = s }
    rc.note(0); rc.note(0); rc.note(0)
    expect(seconds).toBe(1)
  })

  it('navs en vuelo durante el cool-down no lo extienden', () => {
    const clk = fixedClock()
    const rc = makeRateController({ ...CFG, now: clk.now })
    rc.note(0); rc.note(0); rc.note(0)   // dispara: coolDownUntil = 1000
    rc.note(0); rc.note(0); rc.note(0)   // navs en vuelo, también 0
    clk.advance(500)
    expect(rc.gateMs()).toBe(500)        // sigue el cooldown original, no se extendió
  })

  it('el gate expira y, si sigue bloqueado, re-escala a otro cool-down', () => {
    const clk = fixedClock()
    const rc = makeRateController({ ...CFG, now: clk.now })
    rc.note(0); rc.note(0); rc.note(0)
    clk.advance(1000)                    // cool-down expiró
    expect(rc.gateMs()).toBe(0)
    rc.note(0); rc.note(0); rc.note(0)   // sigue bloqueado → nuevo cool-down
    expect(rc.gateMs()).toBe(1000)
  })

  it('un payload no-vacío resetea la racha tras el cool-down', () => {
    const clk = fixedClock()
    const rc = makeRateController({ ...CFG, now: clk.now })
    rc.note(0); rc.note(0); rc.note(0)
    clk.advance(1000)
    rc.note(7)                           // recuperó → racha a 0
    rc.note(0); rc.note(0)               // solo 2 → no dispara
    expect(rc.gateMs()).toBe(0)
  })

  it('deshabilitado (streakLimit 0) nunca enfría', () => {
    const clk = fixedClock()
    const rc = makeRateController({ streakLimit: 0, cooldownMs: 1000, now: clk.now })
    for (let i = 0; i < 20; i++) rc.note(0)
    expect(rc.gateMs()).toBe(0)
  })
})
