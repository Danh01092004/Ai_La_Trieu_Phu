/** Join truthy class names. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Format an integer with Vietnamese thousands separators. */
export function formatCandies(n: number): string {
  return n.toLocaleString('vi-VN')
}

/** Answer letter labels, indexed by answer position. */
export const ANSWER_LETTERS = ['A', 'B', 'C', 'D'] as const
