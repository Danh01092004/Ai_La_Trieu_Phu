export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function formatCandies(n: number): string {
  return n.toLocaleString('vi-VN')
}

export const ANSWER_LETTERS = ['A', 'B', 'C', 'D'] as const
