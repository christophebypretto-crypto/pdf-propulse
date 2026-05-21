/**
 * Parse une expression type "1-3, 5, 7-9" en plages [{from, to}] (zero-based).
 * Renvoie null si l'entree est invalide.
 */
export function parseRanges(
  input: string,
  totalPages: number
): { from: number; to: number }[] | null {
  if (!input.trim()) return null
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean)
  const ranges: { from: number; to: number }[] = []
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      const a = parseInt(m[1], 10)
      const b = parseInt(m[2], 10)
      if (!a || !b || a < 1 || b > totalPages || a > b) return null
      ranges.push({ from: a - 1, to: b - 1 })
      continue
    }
    const single = part.match(/^(\d+)$/)
    if (single) {
      const n = parseInt(single[1], 10)
      if (n < 1 || n > totalPages) return null
      ranges.push({ from: n - 1, to: n - 1 })
      continue
    }
    return null
  }
  return ranges
}

/** Aplatit des plages en liste d'indices zero-based, sans doublons, triee */
export function rangesToIndices(ranges: { from: number; to: number }[]): number[] {
  const set = new Set<number>()
  for (const r of ranges) for (let i = r.from; i <= r.to; i++) set.add(i)
  return Array.from(set).sort((a, b) => a - b)
}
