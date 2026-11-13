/** Difficulty tier attached to every question. */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'very_hard'

export interface Question {
  id: number
  question: string
  answers: string[]
  correct: number
  difficulty: Difficulty
  explanation: string
}

export type LifelineType = 'phone' | 'audience' | 'fifty' | 'mc'

export interface LifelineState {
  phone: boolean
  audience: boolean
  fifty: boolean
  mc: boolean
}

export type AnswerStatus = 'idle' | 'selected' | 'correct' | 'wrong' | 'removed'

export interface Settings {
  music: boolean
  sfx: boolean
  /** Master volume, 0–1. */
  volume: number
}
