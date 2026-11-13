import type {
  GameError,
  GameErrorCode,
  RoomError,
  RoomErrorCode,
} from '@/types/multiplayer'

const ROOM_ERROR_MESSAGES: Record<RoomErrorCode, string> = {
  INVALID_NAME: 'Tên phải từ 2 đến 16 ký tự.',
  INVALID_CODE: 'Mã phòng phải gồm 6 ký tự hợp lệ (không dùng O, 0, I, 1).',
  ROOM_NOT_FOUND: 'Không tìm thấy phòng. Kiểm tra lại mã phòng.',
  ROOM_FULL: 'Phòng đã đủ 40 người chơi.',
  ALREADY_IN_ROOM: 'Bạn đã ở trong một phòng rồi.',
  NOT_IN_ROOM: 'Bạn chưa ở trong phòng nào.',
  ROOM_STARTED: 'Phòng đã bắt đầu nên không thể vào lúc này.',
  ROOM_IN_PROGRESS: 'Ván đấu đang diễn ra nên không thể vào lúc này.',
  ROOM_NOT_FINISHED: 'Ván đấu chưa kết thúc nên chưa thể mở ván mới.',
  NOT_ADMIN: 'Chỉ quản trò mới có thể thực hiện thao tác này.',
  NOT_ENOUGH_PLAYERS: 'Cần ít nhất 2 người chơi để bắt đầu.',
  INVALID_RESUME_TOKEN: 'Phiên phòng đã hết hạn. Hãy tạo hoặc vào phòng mới.',
  PLAYER_BLOCKED: 'Bạn đã bị quản trò chặn khỏi phòng này.',
  PLAYER_NOT_FOUND: 'Người chơi không còn trong phòng.',
  BLOCK_NOT_FOUND: 'Không tìm thấy mục chặn này.',
  CANNOT_TARGET_ADMIN: 'Không thể thao tác với quản trò.',
}

/** Vietnamese copy for server room errors. */
export function roomErrorMessage(error: RoomError): string {
  return ROOM_ERROR_MESSAGES[error.code] ?? error.message
}

const GAME_ERROR_MESSAGES: Record<GameErrorCode, string> = {
  NOT_IN_ROOM: 'Bạn chưa ở trong phòng nào.',
  NOT_A_PLAYER: 'Quản trò chỉ theo dõi bảng xếp hạng, không trả lời câu hỏi.',
  ROOM_NOT_PLAYING: 'Ván đấu chưa bắt đầu.',
  NO_ACTIVE_QUESTION: 'Chưa có câu hỏi nào đang mở.',
  WRONG_QUESTION: 'Câu hỏi đã thay đổi. Hãy trả lời ở câu hiện tại.',
  ALREADY_ANSWERED: 'Bạn đã trả lời câu này rồi.',
  ANSWER_TOO_LATE: 'Đã hết giờ cho câu này.',
  INVALID_ANSWER: 'Đáp án không hợp lệ. Hãy chọn lại.',
  ANSWER_REMOVED: 'Đáp án này đã bị loại bởi trợ giúp 50:50.',
  INVALID_LIFELINE: 'Trợ giúp không hợp lệ.',
  LIFELINE_ALREADY_USED: 'Bạn đã dùng trợ giúp này rồi.',
  LIFELINE_NOT_ALLOWED: 'Không thể dùng trợ giúp lúc này.',
}

/** Vietnamese copy for answer submission errors. */
export function gameErrorMessage(error: GameError): string {
  return GAME_ERROR_MESSAGES[error.code] ?? error.message
}
