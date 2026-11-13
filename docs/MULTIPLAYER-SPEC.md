# Đặc tả multiplayer 40 người — bản đang chạy

> Tài liệu này mô tả **đúng code hiện tại**, không phải kế hoạch B4. Single-player đã bị bỏ khỏi sản phẩm: mọi CTA trên Home đều vào `/multiplayer`.

## 1. Phạm vi đã hoàn thành

| Hạng mục | Hiện tại |
|---|---|
| Phòng | 1 phòng tối đa **40 người chơi + 1 quản trò**, mã **6 ký tự**; người tạo là quản trò, không chơi |
| Quản trò | Chỉ xem BXH/hạng/trạng thái, bắt đầu, chơi lại, **mời ra** và **chặn/bỏ chặn**; không nhận nội dung câu hỏi |
| Ván | **15 câu**, mỗi câu **15 giây**, server chốt giờ |
| Gói hàng | Câu 1 = 1, mỗi câu nhân đôi; câu 15 = 16.384; tối đa không mang thêm **32.767**, tối đa lý thuyết **245.760** |
| Mang thêm | Mỗi câu chọn **10%/25%/100%** số gói hiện có; khóa ở **3 giây cuối**; đúng cộng thêm, sai mất phần mang thêm |
| Sai/hết giờ | Không nhận thưởng câu; nếu có mang thêm thì trừ phần đó, không bị loại; **route riêng** `/multiplayer/chicken` hiện nhanh **3 s** rồi về reveal; nhạc lose tiếp tục dưới reveal và hết trước câu tiếp |
| Reveal | Đáp án đúng + giải thích + phân bố + **BXH top 5** + hạng/gói hàng của bạn + tách thưởng câu/mang thêm |
| Trợ giúp | 4 loại, mỗi loại **1 lần/người/ván**, server cấp dữ liệu và kiểm tra |
| Kết thúc | Hạng **1–5** ăn mừng + BXH đầy đủ; hạng **>5** page gà full + nhạc lose rồi BXH (không confetti/victory); quản trò thấy BXH chung cuộc |
| Chơi lại | Quản trò reset gói hàng + trợ giúp, giữ phòng/người, về lobby |
| Single-player | Đã xoá khỏi route, Home và source; `/game` và `/result` không còn |
| Lưu trữ | Kết quả ghi bền `data/results.json` (atomic temp+rename), API `/api/leaderboard` |
| Reconnect | Token resume xoay vòng; F5/mất mạng khôi phục đúng phòng, câu, gói hàng, mức mang thêm, trợ giúp trong grace 60 s |

## 2. Luồng chính

```
Home
 └─ VÀO ĐẤU TRƯỜNG ─► /multiplayer
      ├─ Tạo phòng ─► Admin dashboard (mã + link + BXH trực tiếp)
      └─ Nhập mã  ─► Lobby người chơi
                         │ quản trò bấm BẮT ĐẦU (≥2 người chơi)
                         ▼
                 Câu 1/15 (15 s)
                         │ hết giờ + 250 ms grace
                         ▼
                 Reveal (6 s; 6,8 s nếu có người sai để nhạc lose kịp hết)
                  ├─ đúng: +điểm, BXH top 5
                  └─ sai/hết giờ: page gà nhanh 3 s → về reveal,
                     nhạc lose tiếp tục dưới reveal
                         ▼
                 Câu 2/15 … Câu 15/15
                         ▼
                 Tổng kết: hạng 1–5 ăn mừng;
                 hạng >5 page gà full 6,5 s + nhạc lose → BXH
                         + ghi data/results.json
                         │ quản trò CHƠI LẠI
                         ▼
                      Lobby
```

Trạng thái phòng: `lobby → playing → final → lobby (rematch)`.

## 3. Điểm và xếp hạng

```ts
pointsForLevel(n) = 2 ** (n - 1)   // n = 1..15
```

- Đúng không mang thêm: cộng thưởng câu, `correct += 1`, cộng `totalMs`.
- Sai/hết giờ không mang thêm: 0 điểm; `totalMs` không cộng.
- Không có streak, không có điểm tốc độ; `totalMs` chỉ là tie-break.
- Tổng tối đa không mang thêm: `2^15 - 1 = 32.767`.

### 3.1. Mang thêm gói hàng

Trong mỗi câu, người chơi có thể chọn **10% / 25% / 100%** số gói hiện có để “mang thêm”:

```ts
wagerAmount = floor(currentScore * percent / 100)
```

- Chọn được nhiều lần; server khóa ở **3 giây cuối** (`wagerLockAt = endsAt - 3000`).
- Đúng: `score += reward + wagerAmount`.
- Sai/hết giờ: không nhận `reward`, đồng thời `score -= wagerAmount` (không xuống dưới 0).
- `10%`/`25%` có thể làm tròn xuống 0 khi số gói còn ít; UI khóa mức đó và server trả `WAGER_NOT_AVAILABLE`.
- Tổng tối đa nếu đúng hết và luôn mang 100%: `15 × 2^14 = 245.760`.

Thứ tự BXH (server sort, client không tự sort):

1. `score` DESC
2. `correct` DESC
3. `totalMs` ASC (tổng thời gian các câu đúng; nhanh hơn xếp trên)
4. `joinedAt` ASC
5. tên (ổn định cuối cùng)

`rank` là thứ hạng strict 1..N, server trả trong `GameRevealPayload.yourRank` và `GameEndPayload.you.rank`.

## 4. Giao thức realtime

### Client → Server

| Event | Payload | Ack |
|---|---|---|
| `room:create` | `{ name, clientId? }` | `{ ok, role:'admin', code, playerId, resumeToken, room, adminState }` hoặc `RoomError` |
| `room:join` | `{ code, name, clientId? }` | `{ ok, role:'player', playerId, resumeToken, room }` hoặc `RoomError` |
| `room:resume` | `{ token }` | `{ ok, role, playerId, resumeToken, room, snapshot, adminState? }` hoặc `RoomError` |
| `room:leave` | `{}` | `{ ok }` |
| `room:start` | `{}` | `{ ok }` hoặc `RoomError`; chỉ quản trò |
| `room:rematch` | `{}` | `{ ok }` hoặc `RoomError`; chỉ quản trò |
| `admin:kick` | `{ playerId }` | `{ ok }` hoặc `RoomError` |
| `admin:block` | `{ playerId }` | `{ ok }` hoặc `RoomError` |
| `admin:unblock` | `{ blockId }` | `{ ok }` hoặc `RoomError` |
| `answer:submit` | `{ questionIndex, answerIndex }` | `{ ok, accepted, questionIndex, receivedAt }` hoặc `GameError` |
| `wager:submit` | `{ questionIndex, percent }` | `{ ok, percent, amount, wagerLockAt }` hoặc `GameError` |
| `lifeline:use` | `{ type, questionIndex }` | `{ ok, type, result }` hoặc `GameError` |

`room:resume` ack trả `snapshot` dạng:

```ts
{ phase: 'lobby' }
| { phase: 'question', question, answered, selectedAnswer, wager, lifelines, removedAnswers }
| { phase: 'reveal', question, reveal, answered, wager, lifelines, removedAnswers }
| { phase: 'final', final }
| { phase: 'admin', admin }   // chỉ quản trò
```

### Server → Client

| Event | Payload |
|---|---|
| `room:state` | `{ code, status, hostId, admin, players, maxPlayers }` — chỉ phát cho người chơi; `hostId` là id quản trò (giữ tên field để tương thích) |
| `admin:state` | BXH trực tiếp + trạng thái từng người + danh sách chặn; chỉ phát cho quản trò |
| `room:kicked` | `{ reason:'kick'\|'block', message }` — gửi riêng người bị mời ra/chặn |
| `room:closed` | `{ reason:'admin_left'\|'admin_timeout', message }` — phòng đóng khi quản trò rời |
| `game:question` | `{ index, total, question, endsAt, durationMs, wagerLockAt, serverNow }` — không gửi cho quản trò |
| `game:reveal` | `{ index, total, correctIndex, explanation, distribution, yourAnswer, yourCorrect, yourBaseReward, yourBaseDelta, yourWagerPercent, yourWagerAmount, yourWagerDelta, yourDelta, yourScore, yourCorrectCount, yourRank, totalPlayers, leaderboard[5], revealDurationMs, revealEndsAt, loseDurationMs, serverNow }` |
| `game:end` | `{ total, leaderboard[], you: { rank, score, correct }, loseDurationMs, serverNow }` |
| `room:error` | `RoomError` |

`game:question.question` chỉ có `id`, `question`, `answers`, `difficulty`; **không có** `correct`/`explanation`. Đáp án đúng chỉ xuất hiện trong `game:reveal` sau khi câu đóng.

### Mã lỗi

- Phòng: `INVALID_NAME`, `INVALID_CODE`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `ALREADY_IN_ROOM`, `NOT_IN_ROOM`, `ROOM_STARTED`, `ROOM_IN_PROGRESS`, `ROOM_NOT_FINISHED`, `NOT_ADMIN`, `CANNOT_TARGET_ADMIN`, `PLAYER_NOT_FOUND`, `PLAYER_BLOCKED`, `BLOCK_NOT_FOUND`, `NOT_ENOUGH_PLAYERS`, `INVALID_RESUME_TOKEN`.
- Câu hỏi: `NOT_IN_ROOM`, `NOT_A_PLAYER`, `ROOM_NOT_PLAYING`, `NO_ACTIVE_QUESTION`, `WRONG_QUESTION`, `ALREADY_ANSWERED`, `ANSWER_TOO_LATE`, `INVALID_ANSWER`, `ANSWER_REMOVED`, `INVALID_WAGER`, `WAGER_LOCKED`, `WAGER_NOT_AVAILABLE`, `INVALID_LIFELINE`, `LIFELINE_ALREADY_USED`, `LIFELINE_NOT_ALLOWED`.

`questionIndex` là 1..15. `lifeline:use` cũng bắt buộc gửi đúng câu hiện tại để request trễ không tiêu hao trợ giúp ở câu sau.

## 5. Trợ giúp (server-authoritative)

Mỗi người có 4 cờ `fifty/phone/audience/mc`; reset khi start/rematch. Server kiểm tra: đúng câu, câu đang mở, chưa trả lời, chưa dùng. Kết quả chỉ gửi cho người dùng.

| Loại | Hành vi |
|---|---|
| `fifty` | Server chọn ngẫu nhiên **2 đáp án sai**, trả `removed`. Trả lời vào index đã xoá bị từ chối `ANSWER_REMOVED`. |
| `phone` | Bạn của người chơi **luôn gợi ý một đáp án sai** (kèm câu nói không chắc); không gửi `correctIndex`/`isCorrect`. |
| `audience` | Khán giả bình chọn; xác suất chọn đúng **0,8 / 0,6 / 0,5 / 0,3**; % luôn cộng 100; chỉ trả `displayWinnerId`, không trả đáp án đúng. |
| `mc` | MC luôn chọn **một đáp án sai**; không gửi `isCorrect`/`correctIndex`. |

Không có payload nào của trợ giúp chứa `isCorrect` hay `correctIndex`. Đồng hồ 15 giây **không dừng** khi mở trợ giúp.

## 6. Kiến trúc

```
React 18 + TS + Vite 5
  Home (/) + /leaderboard (all-time)
  /multiplayer ── useRoom (Socket.IO) ─┐
  /multiplayer/chicken (page gà, cùng component cha) ─┘
                                      │ WebSocket
Express 5 + Socket.IO 4 ──────────────┘
  RoomManager (memory, O(1) player→room, resume token, grace timer, kick/block)
  GameManager (timer, scoring, reveal, final, snapshot, admin dashboard)
  lifelines.ts (server-only random)
  ResultsStore (data/results.json, atomic write, all-time aggregate)
  questions.json (server-only import; không vào bundle client)
```

- Dev: Vite **5173** + server **3001**, proxy `/socket.io`, `/api`, `/healthz`.
- Production: Node >= 20; `npm ci` → `npm run build` → `npm start` phục vụ `dist/`, `/api/leaderboard` và Socket.IO cùng cổng 3001. `tsx` là production dependency; asset thiếu trả 404 thay vì HTML SPA. `RESULTS_FILE` mặc định `data/results.json` phải ghi được; đặt sau reverse proxy phải bật WebSocket upgrade cho `/socket.io/`.
- Phòng/ván trong RAM; **kết quả final ghi JSON bền** (tối đa 500 ván gần nhất).
- `perMessageDeflate: false`, `httpCompression: false`, buffer socket 64 KB.
- Public packet được dựng sẵn lúc start; mỗi câu chỉ phát riêng cho từng người chơi.
- `game:reveal`/`game:end` phát riêng từng socket vì payload có dữ liệu cá nhân; quản trò không nhận các packet này.
- Quản trò chỉ join personal room và nhận `admin:state`. Người chơi join room channel + personal room.
- Resume: token ngẫu nhiên 32 byte, xoay vòng sau mỗi lần resume; socket cũ bị ngắt; token hết hiệu lực khi người chơi rời phòng hoặc hết grace. Nếu ack resume bị mất do mạng chập chờn, client tự thử lại tối đa 2 lần (1,2 s/lần) và chỉ áp dụng kết quả cho đúng token đã gửi.
- F5/reconnect dùng `sessionStorage` theo tab; mở tab thứ hai bằng link mời sẽ vào như người chơi mới.
- Grace mặc định **60 s** (`DISCONNECT_GRACE_MS`), ghế/điểm/trợ giúp/vai trò quản trò được giữ. Hết grace: xoá ghế người chơi; quản trò hết grace thì **đóng phòng**, không chuyển vai trò.
- Kick chỉ mời ra; người chơi có thể vào lại khi phòng ở **lobby** (sau ván hoặc trước khi bắt đầu). Block chặn theo **tên chuẩn hoá hoặc clientId** cho đến khi quản trò bỏ chặn.
- ClientId sinh ở `localStorage` (`altp:multiplayer:client:v1`); đây là lớp chống vào lại tương đối, không phải xác thực tài khoản.

## 7. UI / component

| File | Vai trò |
|---|---|
| `src/pages/Home.tsx` | CTA đấu trường + nút BXH; không còn single-player |
| `src/pages/Leaderboard.tsx` | BXH mọi thời đại từ `/api/leaderboard` |
| `src/pages/multi/Multiplayer.tsx` | entry, admin branch, lobby, câu/reveal/final, route page gà |
| `src/components/multi/AdminRoom.tsx` | dashboard quản trò: mã/link, phase/timer, BXH trực tiếp, kick/block/unblock |
| `src/components/multi/RoomLobby.tsx` | lobby người chơi, chờ quản trò bắt đầu |
| `src/multiplayer/useRoom.ts` | toàn bộ state realtime, resume/F5, token, trợ giúp, admin actions, rematch |
| `src/components/multi/MultiplayerGame.tsx` | câu hỏi, 4 đáp án, điểm, 4 trợ giúp |
| `src/components/multi/MultiplayerReveal.tsx` | đáp án, giải thích, phân bố, BXH top 5 |
| `src/components/multi/ChickenLossPage.tsx` | page gà route riêng: bản nhanh 3 s cho sai giữa câu (nhạc lose tiếp tục dưới reveal), bản full 6,5 s cho final hạng >5 |
| `src/components/multi/MultiLifelines.tsx` | 4 nút trợ giúp, trạng thái đã dùng/đang tải |
| `src/components/multi/LifelineResultCard.tsx` | kết quả 50:50/phone/audience/MC |
| `src/components/multi/LeaderboardList.tsx` | hàng BXH dùng chung reveal/final |
| `src/components/multi/MultiplayerFinal.tsx` | podium, BXH đầy đủ; hạng >5 dùng giao diện thua (không confetti/victory), chờ quản trò chơi lại/rời |
| `src/components/multi/MultiQuestionTimer.tsx` | ring đồng hồ tách riêng, chỉ ring re-render mỗi giây |

Component single-player cũ đã xoá: `Game`, `Result`, `useGame`, `gameEngine`, `ladder`, `QuestionProgress`, `Timer`, `LosePopup`, `VictoryPopup`, `GameResultContext`, `TimerContext`, `gameConfig`…

## 8. Accessibility / responsive

- Touch target ≥44 px; nút rời phòng, nút đóng lỗi, nút trợ giúp đều đạt.
- Đáp án có `role="group"` + `aria-label`; trạng thái khóa/hết giờ nằm trong `aria-live="polite"`.
- Lỗi gửi đáp án/trợ giúp dùng `role="alert"`.
- Page gà dùng `role="alert"`, có nhãn tiếng Việt cho cả sai giữa câu và final ngoài top 5; tôn trọng `prefers-reduced-motion` (không chạy flock khi giảm chuyển động).
- Mobile 390×844 đã đo: `scrollW=390`, đáp án 1 cột rộng 366 px, nút trợ giúp 87×49 px; không tràn ngang.
- Desktop: đáp án 2 cột, ring + panel điểm ở giữa.

## 9. Kiểm thử đã chạy

Tất cả dùng đúng cổng **3001/5173**, không mở port mới.

```powershell
# Fast mode, cùng một server
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run dev:full

# Terminal khác
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run test:flow
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run test:load
```

- `npm run lint` + `npm run build`: xanh.
- `test:results`: ghi file tạm, đọc lại, best-per-name, phục hồi file hỏng.
- `test:rooms`: create/join/leave, 40 người chơi + quản trò, cap 40, quản trò đóng phòng, start rules, 20 mã unique.
- `test:admin`: kick/rejoin, block theo tên/clientId, unblock, chặn người thường gọi admin action, quản trò không trả lời/dùng trợ giúp, dashboard không lộ nội dung câu.
- `test:server`: health, websocket/polling handshake, scoring.
- `test:game` (15 câu, 300 ms, reveal 300): 15 câu unique, cùng deadline, không lộ đáp án, validation đúng.
- `test:flow` (3 câu): scoring 1→2, reveal, 4 trợ giúp, 50:50 chặn `ANSWER_REMOVED`, dùng lại `LIFELINE_ALREADY_USED`, request sai câu `WRONG_QUESTION`, final + rematch, API all-time có kết quả vừa ghi.
- `test:load`: **1 quản trò + 40 người chơi**, 3 câu hoặc đủ 15 câu, mỗi người trả lời mỗi câu; final BXH 40 người, không có quản trò; dashboard quản trò 40 dòng; người thứ 41 bị `ROOM_FULL`; đo p95 broadcast và assert **<300 ms**.
- `test:resume` (server 3 câu/3 s, grace 8 s): resume lobby/câu/reveal/final cho cả quản trò và người chơi; token xoay vòng; token cũ bị từ chối; hết grace xoá ghế người chơi; quản trò hết grace đóng phòng (`room:closed` reason `admin_timeout`).
- Browser: F5 lobby/câu đã khóa đáp án/final khôi phục đúng; F5 quản trò khi đang câu vẫn giữ dashboard; BXH all-time API/UI; mobile 390×844 không tràn.
- Browser B11 (6 người, 3 câu, `LOSE_MS=1000`): sai giữa câu mở `#/multiplayer/chicken` nhanh rồi về reveal, nhạc lose tiếp tục; final hạng **6/6** hiện page gà "CHƯA VÀO TOP 5!", `loseDurationMs` từ `game:end`, sau đó BXH thua không confetti/victory. Hạng 1–5 vào thẳng màn tổng kết thường.
- Browser B12: dashboard quản trò chỉ có BXH/trạng thái, không có nội dung câu; kick P1 rồi P1 vào lại được; block P2 rồi P2 bị từ chối, bỏ chặn thì vào lại được; start khi đủ 2 người, quản trò vẫn không nhận câu; final + CHƠI LẠI về lobby đúng. Nút start hiển thị số người thay vì `6/2`.
- B8 persistence: chơi xong một ván, dừng và khởi động lại server cùng `RESULTS_FILE`; API và trang `/leaderboard` vẫn trả đúng tên/điểm/ván. File ghi atomic, đọc lại khi khởi động.
- Production smoke (`npm run test:prod` sau `npm run build && npm start`): `/` 200 từ `dist` không có `@vite/client`; 5 JS/CSS có hash + cache immutable; SPA fallback extensionless 200; `/api/nope` 404 JSON; asset thiếu 404 text (không trả HTML); `/index.html` no-cache; audio MP3 206 đúng `audio/mpeg`; Socket.IO handshake; tạo phòng, 2 người join, start và nhận câu hỏi trên cổng 3001.
- `dist/` không chứa text câu hỏi/`explanation`; question bank chỉ nằm server.

## 10. Giới hạn đã biết

- Phòng/ván vẫn trong RAM; restart server làm mất phòng **đang chạy**, nhưng kết quả final đã ghi vẫn còn.
- All-time định danh theo **tên hiển thị** (không có tài khoản); mỗi tên giữ điểm cao nhất, tổng số ván và lần chơi cuối.
- F5 resume trong cùng tab (`sessionStorage`). Đóng tab hẳn thì ghế được giữ tối đa 60 s rồi giải phóng.
- Không có spectator, chat, late join. Kick mời ra và có thể vào lại; block theo tên/clientId chỉ trong phòng hiện tại. Block không phải xác thực tài khoản: đổi tên + trình duyệt khác vẫn có thể vào.
- Quản trò không chơi, không nhận nội dung câu hỏi. Quản trò rời/hết grace đóng phòng; không chuyển vai trò.
- Page gà giữa câu chỉ **3 s** để chơi nhanh; nhạc lose vẫn phát tiếp dưới reveal (server giữ reveal 6,8 s nếu có người sai để track ~6,1 s kết thúc trước câu tiếp).
- Câu 15 không có “câu tiếp theo” nên bỏ page gà nhanh; người sai câu 15 đi thẳng vào reveal, sau đó hạng >5 nhận page gà final đầy đủ.
- Final: hạng **1–5** vào màn tổng kết ăn mừng; hạng **>5** page gà full **6,5 s** + nhạc lose rồi mới hiện BXH, không phát victory/confetti.
- BXH reveal chỉ top 5 + hạng của bạn; bảng đầy đủ ở final và BXH all-time.
