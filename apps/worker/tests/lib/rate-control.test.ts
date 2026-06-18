import { describe, it, expect } from 'vitest'
import { makeRateController, isBlockCompromised } from '@/lib/product-hunter/scraper'

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

describe('makeRateController — hard-abort (block persistente)', () => {
  // Dispara UN cool-down: streakLimit ceros, luego avanza el reloj para que el
  // gate expire (requisito de note() para re-disparar el próximo).
  function tripCooldown(rc: ReturnType<typeof makeRateController>, clk: ReturnType<typeof fixedClock>) {
    for (let i = 0; i < CFG.streakLimit; i++) rc.note(0)
    clk.advance(CFG.cooldownMs)
  }

  it('tras maxCooldowns cool-downs SIN recuperar → persistentemente bloqueado', () => {
    const clk = fixedClock()
    const rc = makeRateController({ ...CFG, maxCooldowns: 3, now: clk.now })
    tripCooldown(rc, clk)
    expect(rc.isPersistentlyBlocked()).toBe(false)
    tripCooldown(rc, clk)
    expect(rc.isPersistentlyBlocked()).toBe(false)
    tripCooldown(rc, clk)                       // 3er cool-down sin recuperar
    expect(rc.isPersistentlyBlocked()).toBe(true)
  })

  it('una recuperación (payload>0) resetea el contador → no se declara block', () => {
    const clk = fixedClock()
    const rc = makeRateController({ ...CFG, maxCooldowns: 3, now: clk.now })
    tripCooldown(rc, clk)
    tripCooldown(rc, clk)
    rc.note(9)                                   // recuperó nodos → contador a 0
    tripCooldown(rc, clk)
    tripCooldown(rc, clk)
    expect(rc.isPersistentlyBlocked()).toBe(false) // solo 2 seguidos desde el reset
  })

  it('onPersistentBlock se invoca UNA vez con el conteo de cool-downs', () => {
    const clk = fixedClock()
    const rc = makeRateController({ ...CFG, maxCooldowns: 2, now: clk.now })
    let calls = 0; let count = -1
    rc.onPersistentBlock = (c) => { calls++; count = c }
    tripCooldown(rc, clk)
    tripCooldown(rc, clk)                         // 2º → dispara
    tripCooldown(rc, clk)                         // sigue bloqueado, NO re-dispara el callback
    expect(calls).toBe(1)
    expect(count).toBe(2)
    expect(rc.isPersistentlyBlocked()).toBe(true)
  })

  it('maxCooldowns 0 (default) deshabilita el hard-abort', () => {
    const clk = fixedClock()
    const rc = makeRateController({ ...CFG, now: clk.now })  // sin maxCooldowns
    for (let i = 0; i < 10; i++) tripCooldown(rc, clk)
    expect(rc.isPersistentlyBlocked()).toBe(false)
  })
})

describe('isBlockCompromised', () => {
  const ratio = 0.6
  const min = 8

  it('detecta el run de varices (247/268 ≈ 92% vacías)', () => {
    // searchZeros reales del run bloqueado vs total de búsquedas
    expect(isBlockCompromised(126, 110, ratio, min)).toBe(true)
  })

  it('NO marca un run sano (nariz: pocas vacías)', () => {
    expect(isBlockCompromised(69, 11, ratio, min)).toBe(false)
  })

  it('no juzga runs por debajo de la muestra mínima', () => {
    // 5 de 5 vacías = 100%, pero <8 búsquedas → no concluye (evita falso positivo)
    expect(isBlockCompromised(5, 5, ratio, min)).toBe(false)
  })

  it('justo en el umbral cuenta como bloqueado', () => {
    expect(isBlockCompromised(10, 6, ratio, min)).toBe(true)   // 60% == ratio
    expect(isBlockCompromised(10, 5, ratio, min)).toBe(false)  // 50% < ratio
  })
})
