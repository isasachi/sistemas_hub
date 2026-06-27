export interface RegenButtonState {
  disabled: boolean
  showCounter: boolean
  reason: string | null
}

// regensLeft: number = step de imagen (con tope); null = copy (sin contador).
export function regenButtonState(regensLeft: number | null, busy: boolean): RegenButtonState {
  const outOfRegens = regensLeft !== null && regensLeft <= 0
  return {
    disabled: busy || outOfRegens,
    showCounter: regensLeft !== null,
    reason: outOfRegens ? 'Llegaste al límite de regeneraciones de este paso.' : null,
  }
}
