export type Difficulty = 'easy' | 'medium' | 'hard' | 'very_hard'

export interface Question {
  id: number
  question: string
  answers: string[]
  correct: number
  difficulty: Difficulty
  explanation: string
}

export interface LadderLevel {
  level: number
  candies: number
  isSafe: boolean
}

export type LifelineType = 'phone' | 'audience' | 'fifty' | 'mc'

export interface LifelineState {
  phone: boolean
  audience: boolean
  fifty: boolean
  mc: boolean
}

export type GamePhase =
  | 'idle'
  | 'intro'
  | 'question'
  | 'locked'
  | 'reveal'
  | 'correct'
  | 'decision'
  | 'wrong'
  | 'won'
  | 'lost'

export type AnswerStatus = 'idle' | 'selected' | 'correct' | 'wrong' | 'removed'

export interface Settings {
  music: boolean
  sfx: boolean
  volume: number
  sfxVolume: number
}

/**
 * Result returned by the Khán Giả (Ask Audience) lifeline.
 *
 * The audience intentionally trolls the player based on difficulty.
 * `displayWinnerId` is the answer index shown as "winning" in the overlay —
 * it may or may not be the actual correct answer.
 * `correctIndex` is always the real correct answer (used only post-game).
 */
export interface AskAudienceResult {
  /** Vote percentage (integer 0-100) for each answer index [0,1,2,3]. Total = 100. */
  percentages: [number, number, number, number]
  /** The answer index displayed as having the highest vote (may be wrong!). */
  displayWinnerId: number
  /** The actual correct answer index (ground truth, not shown during overlay). */
  correctIndex: number
  /** Whether the audience happened to give the correct answer this time. */
  audienceWasCorrect: boolean
}

/** Result returned by the Hỏi MC lifeline. */
export interface AskMcResult {
  /** 0-based index of the answer the MC suggests. */
  suggestedIndex: number
  /** Letter label for display: A / B / C / D */
  suggestedLetter: string
  /** Full text of the suggested answer. */
  suggestedText: string
  /** Whether the suggestion is actually correct (known only after game ends). */
  isCorrect: boolean
}

export interface GameResultPayload {
  outcome: 'won' | 'lost' | 'retired'
  reachedLevel: number
  candies: number
  reason: 'wrong' | 'timeout' | 'complete' | 'retired' | null
}
