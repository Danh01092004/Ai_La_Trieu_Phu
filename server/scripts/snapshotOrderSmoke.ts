/**
 * Regression checks for resume snapshots that race live game events.
 *
 * Run with `npm run test:snapshot` (no server needed).
 */
import assert from 'node:assert/strict'
import type { GameSnapshot } from '../../src/types/multiplayer'
import { isStaleSnapshot, type LiveSnapshotPosition } from '../../src/multiplayer/snapshotOrder'

function question(index: number): GameSnapshot {
  return {
    phase: 'question',
    question: { index },
  } as unknown as GameSnapshot
}

function reveal(index: number): GameSnapshot {
  return {
    phase: 'reveal',
    reveal: { index },
  } as unknown as GameSnapshot
}

function lobby(): GameSnapshot {
  return { phase: 'lobby' } as GameSnapshot
}

function final(): GameSnapshot {
  return { phase: 'final' } as unknown as GameSnapshot
}

function live(
  questionIndex: number | null,
  revealIndex: number | null,
  roomStatus: string | null = 'playing',
): LiveSnapshotPosition {
  return { questionIndex, revealIndex, roomStatus }
}

const check = (snapshot: GameSnapshot, position: LiveSnapshotPosition, expected: boolean) =>
  assert.equal(
    isStaleSnapshot(snapshot, position),
    expected,
    `${snapshot.phase} vs ${JSON.stringify(position)}`,
  )

// A snapshot captured before a live question/reveal must not move the UI back.
check(question(4), live(5, null), true)
check(reveal(4), live(5, null), true)
check(reveal(4), live(5, 5), true)

// The same question or a newer reveal is legitimate.
check(question(5), live(5, null), false)
check(reveal(5), live(5, null), false)
check(reveal(5), live(5, 5), false)

// A question snapshot is older than a reveal for that same question.
check(question(5), live(5, 5), true)

// Lobby snapshots always apply; a rematch can legitimately move a stale local
// question state back to the lobby.
check(lobby(), live(1, null), false)
check(lobby(), live(null, null, 'playing'), false)
check(lobby(), live(null, null, 'final'), false)
check(lobby(), live(null, null, 'lobby'), false)

// Final is terminal; admin snapshots belong to the non-playing host.
check(final(), live(5, null), false)
check({ phase: 'admin', admin: {} } as unknown as GameSnapshot, live(5, null), false)

console.log('[snapshot-order] stale resume snapshots and same-index reveal ordering passed')
