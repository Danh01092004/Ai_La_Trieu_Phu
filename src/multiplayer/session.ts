/** sessionStorage is per tab, so opening an invite in a new tab stays a new player. */
export const ROOM_SESSION_KEY = 'altp:multiplayer:session:v2'

/** True when this tab has a room session that the multiplayer page can resume. */
export function hasRoomSession(): boolean {
  try {
    return Boolean(window.sessionStorage.getItem(ROOM_SESSION_KEY))
  } catch {
    return false
  }
}
