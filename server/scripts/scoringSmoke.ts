/**
 * B5 unit checks (no server needed): the 15-step doubling ladder and every
 * ranking tie-break. Run with `npm run test:scoring`.
 */
import assert from 'node:assert/strict'
import {
  BASE_MAX_POINTS,
  MAX_POINTS,
  TOTAL_QUESTIONS,
  pointsForLevel,
  wagerForScore,
} from '../../src/config/multiplayerConfig'
import { buildLeaderboard, compareRoomPlayers } from '../ranking'
import type { RoomPlayer } from '../rooms'

let joinedAtSeed = 1_000

function makePlayer(
  id: string,
  overrides: Partial<RoomPlayer> = {},
): RoomPlayer {
  joinedAtSeed += 1
  return {
    id,
    name: id,
    clientId: `client-${id}`,
    role: 'player',
    score: 0,
    correct: 0,
    totalMs: 0,
    joinedAt: joinedAtSeed,
    connected: true,
    socketId: `socket-${id}`,
    resumeToken: `token-${id}`,
    lifelines: { fifty: false, phone: false, audience: false, mc: false },
    ...overrides,
  }
}

function testPointsLadder(): void {
  let expected = 1
  let cumulative = 0

  for (let level = 1; level <= TOTAL_QUESTIONS; level += 1) {
    assert.equal(pointsForLevel(level), expected, `level ${level}`)
    cumulative += expected
    expected *= 2
  }

  assert.equal(pointsForLevel(1), 1)
  assert.equal(pointsForLevel(15), 16_384)
  assert.equal(cumulative, 32_767)
  assert.equal(cumulative, BASE_MAX_POINTS)
  assert.equal(MAX_POINTS, 245_760)
  assert.throws(() => pointsForLevel(0), RangeError)
  assert.throws(() => pointsForLevel(16), RangeError)
  assert.throws(() => pointsForLevel(1.5), RangeError)
}

function testWagerMath(): void {
  assert.equal(wagerForScore(0, 100), 0)
  assert.equal(wagerForScore(1, 10), 0)
  assert.equal(wagerForScore(1, 100), 1)
  assert.equal(wagerForScore(99, 10), 9)
  assert.equal(wagerForScore(100, 25), 25)
  assert.equal(wagerForScore(100, 100), 100)
  assert.throws(() => wagerForScore(-1, 10), RangeError)
  assert.throws(() => wagerForScore(10, 50), RangeError)
  assert.throws(() => wagerForScore(10, 3), RangeError)
}

function testRankingTieBreaks(): void {
  const base = makePlayer('base')

  const higherScore = makePlayer('a', { score: 5 })
  const lowerScore = makePlayer('b', { score: 4 })
  assert.ok(compareRoomPlayers(higherScore, lowerScore) < 0)

  const moreCorrect = makePlayer('c', { score: 5, correct: 2 })
  const fewerCorrect = makePlayer('d', { score: 5, correct: 1 })
  assert.ok(compareRoomPlayers(moreCorrect, fewerCorrect) < 0)

  const faster = makePlayer('e', { score: 5, correct: 2, totalMs: 500 })
  const slower = makePlayer('f', { score: 5, correct: 2, totalMs: 900 })
  assert.ok(compareRoomPlayers(faster, slower) < 0)

  const firstJoined = makePlayer('g', {
    score: 5,
    correct: 2,
    totalMs: 500,
    joinedAt: 100,
  })
  const laterJoined = makePlayer('h', {
    score: 5,
    correct: 2,
    totalMs: 500,
    joinedAt: 200,
  })
  assert.ok(compareRoomPlayers(firstJoined, laterJoined) < 0)

  const alpha = makePlayer('i', {
    ...base,
    id: 'i',
    name: 'An',
    joinedAt: 300,
  })
  const beta = makePlayer('j', {
    ...base,
    id: 'j',
    name: 'Bình',
    joinedAt: 300,
  })
  assert.ok(compareRoomPlayers(alpha, beta) < 0)
  assert.equal(compareRoomPlayers(base, base), 0)
}

function testStrictRanks(): void {
  const players: RoomPlayer[] = []
  for (let index = 0; index < 40; index += 1) {
    players.push(
      makePlayer(`p${index.toString().padStart(2, '0')}`, {
        score: (index % 4) * 1_000,
        correct: index % 5,
        totalMs: index * 10,
        joinedAt: 1_000 + index,
      }),
    )
  }

  const board = buildLeaderboard(players)
  assert.equal(board.length, 40)
  assert.deepEqual(
    board.map((entry) => entry.rank),
    Array.from({ length: 40 }, (_, index) => index + 1),
  )
  assert.equal(new Set(board.map((entry) => entry.playerId)).size, 40)

  for (let index = 1; index < board.length; index += 1) {
    assert.ok(
      compareRoomPlayers(
        players.find((player) => player.id === board[index - 1].playerId)!,
        players.find((player) => player.id === board[index].playerId)!,
      ) <= 0,
    )
  }

  // Ranking must not mutate the room's player collection.
  const idsBefore = players.map((player) => player.id).join(',')
  buildLeaderboard(players)
  assert.equal(players.map((player) => player.id).join(','), idsBefore)
}

testPointsLadder()
testWagerMath()
testRankingTieBreaks()
testStrictRanks()
console.log(
  '[scoring] 15-level doubling ladder, max score, all tie-breaks and strict ranks passed',
)
