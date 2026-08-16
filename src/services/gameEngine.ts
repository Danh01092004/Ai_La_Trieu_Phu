import type {
  AnswerStatus,
  GamePhase,
  LifelineState,
  Question,
} from '@/types'
import { drawQuestions } from './questionManager'
import { candiesForLevel, guaranteedCandies, TOTAL_QUESTIONS } from './ladder'
import { computeFiftyFifty } from './lifeline'

export interface GameState {
  phase: GamePhase
  questions: Question[]
  currentIndex: number
  selectedIndex: number | null
  answerStatus: AnswerStatus[]
  removedIndices: number[]
  lifelines: LifelineState
  candies: number
  reason: 'wrong' | 'timeout' | 'complete' | 'retired' | null
  /**
   * Monotonically incrementing session counter.  Bumped on every INIT so
   * effects that key on it (timer, audio) can detect a true game restart and
   * avoid stale closures from the previous session.
   */
  sessionKey: number
}

export type GameAction =
  | { type: 'INIT' }
  | { type: 'BEGIN' }
  | { type: 'SELECT'; index: number }
  | { type: 'LOCK' }
  | { type: 'REVEAL' }
  | { type: 'DECIDE' }
  | { type: 'CONTINUE' }
  | { type: 'STOP' }
  | { type: 'TIMEOUT' }
  | { type: 'USE_FIFTY' }
  | { type: 'USE_PHONE' }
  | { type: 'USE_AUDIENCE' }
  | { type: 'USE_MC' }

// Module-level session counter so it always increases, even across hot-reloads.
let _sessionKey = 0

export function createInitialState(): GameState {
  const questions = drawQuestions(TOTAL_QUESTIONS)
  return {
    phase: 'idle',
    questions,
    currentIndex: 0,
    selectedIndex: null,
    answerStatus: freshAnswerStatus(),
    removedIndices: [],
    lifelines: { phone: false, audience: false, fifty: false, mc: false },
    candies: 0,
    reason: null,
    sessionKey: _sessionKey,
  }
}

function freshAnswerStatus(): AnswerStatus[] {
  return ['idle', 'idle', 'idle', 'idle']
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'INIT':
      // Always draw a fresh question set and bump the session key so
      // callers (timer, audio) can detect the new session.
      _sessionKey += 1
      return { ...createInitialState(), sessionKey: _sessionKey }

    case 'BEGIN':
      return { ...state, phase: 'question' }

    case 'SELECT': {
      if (state.phase !== 'question') return state
      if (state.removedIndices.includes(action.index)) return state
      const status = freshAnswerStatus()
      status[action.index] = 'selected'
      state.removedIndices.forEach((i) => (status[i] = 'removed'))
      return { ...state, selectedIndex: action.index, answerStatus: status, phase: 'locked' }
    }

    case 'REVEAL': {
      if (state.phase !== 'locked' || state.selectedIndex === null) return state
      const q = state.questions[state.currentIndex]
      const isCorrect = state.selectedIndex === q.correct
      const status = freshAnswerStatus()
      state.removedIndices.forEach((i) => (status[i] = 'removed'))
      status[q.correct] = 'correct'
      if (!isCorrect) status[state.selectedIndex] = 'wrong'

      if (isCorrect) {
        return {
          ...state,
          answerStatus: status,
          phase: 'correct',
          candies: candiesForLevel(state.currentIndex + 1),
        }
      }
      return {
        ...state,
        answerStatus: status,
        phase: 'wrong',
        candies: guaranteedCandies(state.currentIndex),
        reason: 'wrong',
      }
    }

    case 'DECIDE': {
      if (state.phase !== 'correct') return state
      return { ...state, phase: 'decision' }
    }

    case 'CONTINUE': {
      if (state.phase !== 'decision') return state
      const nextIndex = state.currentIndex + 1
      if (nextIndex >= TOTAL_QUESTIONS) {
        return { ...state, phase: 'won', reason: 'complete' }
      }
      return {
        ...state,
        currentIndex: nextIndex,
        selectedIndex: null,
        answerStatus: freshAnswerStatus(),
        removedIndices: [],
        phase: 'question',
      }
    }

    case 'STOP': {
      if (state.phase !== 'decision') return state
      return { ...state, phase: 'lost', reason: 'retired' }
    }

    case 'TIMEOUT': {
      if (state.phase !== 'question' && state.phase !== 'locked') return state
      const q = state.questions[state.currentIndex]
      const status = freshAnswerStatus()
      state.removedIndices.forEach((i) => (status[i] = 'removed'))
      status[q.correct] = 'correct'
      return {
        ...state,
        answerStatus: status,
        phase: 'wrong',
        candies: guaranteedCandies(state.currentIndex),
        reason: 'timeout',
      }
    }

    case 'USE_FIFTY': {
      if (state.lifelines.fifty || state.phase !== 'question') return state
      const q = state.questions[state.currentIndex]
      const removed = computeFiftyFifty(q)
      const status = freshAnswerStatus()
      removed.forEach((i) => (status[i] = 'removed'))
      return {
        ...state,
        lifelines: { ...state.lifelines, fifty: true },
        removedIndices: removed,
        answerStatus: status,
      }
    }

    case 'USE_PHONE':
      if (state.lifelines.phone) return state
      return { ...state, lifelines: { ...state.lifelines, phone: true } }

    case 'USE_AUDIENCE':
      if (state.lifelines.audience) return state
      return { ...state, lifelines: { ...state.lifelines, audience: true } }

    case 'USE_MC':
      if (state.lifelines.mc) return state
      return { ...state, lifelines: { ...state.lifelines, mc: true } }

    default:
      return state
  }
}
