/** Item uniforme que devuelven todos los GET /api/<tool>/sessions. */
export interface HistoryItem {
  id: string
  created_at: string
  step: number
  title: string
  thumb: string | null
  done: boolean
}
