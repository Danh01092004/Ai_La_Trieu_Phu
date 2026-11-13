/**
 * Persistence/all-time smoke test. Runs entirely offline against a temp file.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResultsStore } from '../results'

const dir = mkdtempSync(join(tmpdir(), 'altp-results-'))
const file = join(dir, 'results.json')

try {
  const store = new ResultsStore(file)
  store.recordMatch({
    roomCode: 'AAAAAA',
    total: 20,
    players: [
      { name: 'An', score: 100, correct: 5, rank: 1 },
      { name: 'Bình', score: 50, correct: 3, rank: 2 },
    ],
  })
  store.recordMatch({
    roomCode: 'BBBBBB',
    total: 20,
    players: [
      { name: 'An', score: 300, correct: 8, rank: 1 },
      { name: 'Bình', score: 20, correct: 1, rank: 2 },
      { name: 'Chi', score: 10, correct: 1, rank: 3 },
    ],
  })

  assert.equal(store.totalMatches, 2)
  const board = store.allTime(10)
  assert.deepEqual(
    board.map((entry) => [entry.rank, entry.name, entry.score, entry.matches]),
    [
      [1, 'An', 300, 2],
      [2, 'Bình', 50, 2],
      [3, 'Chi', 10, 1],
    ],
  )

  const raw = JSON.parse(readFileSync(file, 'utf8')) as { matches: unknown[] }
  assert.equal(raw.matches.length, 2)

  const reloaded = new ResultsStore(file)
  assert.equal(reloaded.totalMatches, 2)
  assert.equal(reloaded.allTime(1)[0]?.name, 'An')
  assert.equal(reloaded.allTime(1)[0]?.score, 300)

  // Corrupt files must not crash boot; the store starts empty.
  const corrupt = join(dir, 'corrupt.json')
  writeFileSync(corrupt, '{not-json', 'utf8')
  const empty = new ResultsStore(corrupt)
  assert.equal(empty.totalMatches, 0)
  assert.deepEqual(empty.allTime(5), [])

  console.info('[results] JSON persistence, best-per-name ranking and corrupt-file recovery passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
