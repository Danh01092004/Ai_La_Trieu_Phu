import type { GameSnapshot } from '../types/multiplayer'

export interface LiveSnapshotPosition {
  questionIndex: number | null
  revealIndex: number | null
  roomStatus: string | null
}

/**
 * A resume ack can race a live `game:question`/`game:reveal` that arrives while
 * the request is in flight. The snapshot is captured before that event, so
 * applying it afterwards would move the UI backwards by one question.
 *
 * Indexes are monotonic within a match, which is enough to reject the stale
 * snapshot without adding a version to the wire protocol. A same-index reveal
 * still wins over a question (the reveal is the newer phase).
 */
export function isStaleSnapshot(
  snapshot: GameSnapshot,
  live: LiveSnapshotPosition,
): boolean {
  if (snapshot.phase === 'final') return false
  if (snapshot.phase === 'admin') return false

  const currentQuestion = live.questionIndex ?? 0
  const currentReveal = live.revealIndex ?? 0

  // Lobby has no per-match index. A rematch legitimately returns to the lobby
  // while the previous question is still in local state, so it must not be
  // filtered by the index guard; `room:state` owns that transition.
  if (snapshot.phase === 'lobby') return false

  if (live.roomStatus === 'final') return true

  if (snapshot.phase === 'question') {
    const index = snapshot.question.index
    if (currentQuestion > index || currentReveal > index) return true
    // A reveal for the same question is newer than this question snapshot.
    return currentReveal === index
  }

  const index = snapshot.reveal.index
  return currentQuestion > index || currentReveal > index
}
