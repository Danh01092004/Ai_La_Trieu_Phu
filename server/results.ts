import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import type {
  AllTimeEntry,
  StoredMatch,
  StoredMatchPlayer,
} from '../src/types/leaderboard'

const DEFAULT_RESULTS_FILE = resolve(process.cwd(), 'data', 'results.json')
const MAX_STORED_MATCHES = 500

interface ResultsFile {
  version: 1
  updatedAt: number | null
  matches: StoredMatch[]
}

interface RecordMatchInput {
  roomCode: string
  total: number
  players: StoredMatchPlayer[]
}

function isStoredMatchPlayer(value: unknown): value is StoredMatchPlayer {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.name === 'string' &&
    typeof record.score === 'number' &&
    Number.isFinite(record.score) &&
    typeof record.correct === 'number' &&
    Number.isFinite(record.correct) &&
    typeof record.rank === 'number' &&
    Number.isFinite(record.rank)
  )
}

function isStoredMatch(value: unknown): value is StoredMatch {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.roomCode === 'string' &&
    typeof record.finishedAt === 'number' &&
    Number.isFinite(record.finishedAt) &&
    typeof record.total === 'number' &&
    Number.isFinite(record.total) &&
    Array.isArray(record.players) &&
    record.players.every(isStoredMatchPlayer)
  )
}

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('vi')
}

/**
 * Durable, dependency-free match archive.
 *
 * The game has no account system, so the all-time board is intentionally
 * name-based: each name keeps its single best result. Writes are synchronous
 * and atomic (temp file + rename), which is cheap for one write per match and
 * means a completed final is durable before the process can be killed.
 */
export class ResultsStore {
  private matches: StoredMatch[] = []
  private updatedAt: number | null = null
  private readonly filePath: string

  constructor(filePath = process.env.RESULTS_FILE ?? DEFAULT_RESULTS_FILE) {
    this.filePath = filePath
    this.load()
  }

  recordMatch(input: RecordMatchInput): StoredMatch {
    const match: StoredMatch = {
      id: randomUUID(),
      roomCode: input.roomCode,
      finishedAt: Date.now(),
      total: input.total,
      players: input.players.map((player) => ({ ...player })),
    }

    this.matches.push(match)
    if (this.matches.length > MAX_STORED_MATCHES) {
      this.matches = this.matches.slice(-MAX_STORED_MATCHES)
    }
    this.updatedAt = match.finishedAt
    this.persist()
    return match
  }

  allTime(limit = 20): AllTimeEntry[] {
    const best = new Map<
      string,
      {
        name: string
        score: number
        correct: number
        total: number
        matches: number
        lastPlayedAt: number
      }
    >()

    for (const match of this.matches) {
      for (const player of match.players) {
        const key = nameKey(player.name)
        if (!key) continue
        const current = best.get(key)
        if (!current) {
          best.set(key, {
            name: player.name,
            score: player.score,
            correct: player.correct,
            total: match.total,
            matches: 1,
            lastPlayedAt: match.finishedAt,
          })
          continue
        }

        current.matches += 1
        current.lastPlayedAt = Math.max(current.lastPlayedAt, match.finishedAt)
        if (
          player.score > current.score ||
          (player.score === current.score && player.correct > current.correct)
        ) {
          current.name = player.name
          current.score = player.score
          current.correct = player.correct
          current.total = match.total
        }
      }
    }

    return [...best.values()]
      .sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score
        if (left.correct !== right.correct) return right.correct - left.correct
        return left.name.localeCompare(right.name, 'vi')
      })
      .slice(0, limit)
      .map((entry, index) => ({ ...entry, rank: index + 1 }))
  }

  get totalMatches(): number {
    return this.matches.length
  }

  get updatedAtValue(): number | null {
    return this.updatedAt
  }

  private load(): void {
    if (!existsSync(this.filePath)) return

    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<ResultsFile>
      const matches = Array.isArray(raw.matches)
        ? raw.matches.filter(isStoredMatch)
        : []
      this.matches = matches.slice(-MAX_STORED_MATCHES)
      this.updatedAt =
        typeof raw.updatedAt === 'number'
          ? raw.updatedAt
          : (this.matches.at(-1)?.finishedAt ?? null)
      console.info(
        `[results] loaded ${this.matches.length} match(es) from ${this.filePath}`,
      )
    } catch (error) {
      console.error(`[results] could not read ${this.filePath}`, error)
      this.matches = []
      this.updatedAt = null
    }
  }

  private persist(): void {
    const payload: ResultsFile = {
      version: 1,
      updatedAt: this.updatedAt,
      matches: this.matches,
    }
    const tempPath = `${this.filePath}.tmp`

    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
      renameSync(tempPath, this.filePath)
    } catch (error) {
      console.error(`[results] could not write ${this.filePath}`, error)
    }
  }
}

export { DEFAULT_RESULTS_FILE }
