import type { LeaderboardEntry } from '../src/types/multiplayer'
import type { RoomPlayer } from './rooms'

/**
 * B5 ranking rules, kept dependency-free so they can be unit-tested without a
 * running Socket.IO server:
 *   score desc → correct desc → total correct time asc → join order asc → name.
 * Ranks stay strict/unique even when two players have identical stats.
 */
export function compareRoomPlayers(left: RoomPlayer, right: RoomPlayer): number {
  if (left.score !== right.score) return right.score - left.score
  if (left.correct !== right.correct) return right.correct - left.correct
  if (left.totalMs !== right.totalMs) return left.totalMs - right.totalMs
  if (left.joinedAt !== right.joinedAt) return left.joinedAt - right.joinedAt
  return left.name.localeCompare(right.name, 'vi')
}

export function buildLeaderboard(
  players: Iterable<RoomPlayer>,
): LeaderboardEntry[] {
  return [...players]
    .sort(compareRoomPlayers)
    .map((player, index) => ({
      playerId: player.id,
      name: player.name,
      score: player.score,
      correct: player.correct,
      rank: index + 1,
    }))
}
