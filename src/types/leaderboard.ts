/** Persisted results and the public all-time leaderboard API. */

export interface StoredMatchPlayer {
  name: string
  score: number
  correct: number
  rank: number
}

export interface StoredMatch {
  id: string
  roomCode: string
  finishedAt: number
  total: number
  players: StoredMatchPlayer[]
}

export interface AllTimeEntry {
  rank: number
  /** Display name of the best result for that name. */
  name: string
  score: number
  correct: number
  total: number
  /** Number of completed matches recorded under this name. */
  matches: number
  lastPlayedAt: number
}

export interface AllTimeLeaderboardResponse {
  ok: true
  entries: AllTimeEntry[]
  totalMatches: number
  updatedAt: number | null
}
