# Multiplayer UI — B2 → B8

## Trạng thái

| Bước | Nội dung | Trạng thái |
|---|---|---|
| B2 | Tạo/join phòng 40 người, mã 6 ký tự, lobby realtime | ✅ |
| B3 | Quản trò bắt đầu, `lobby → playing`, màn chuyển tiếp | ✅ |
| B4 | 15 câu unique, phát câu hỏi, deadline server, 1 đáp án/người | ✅ |
| B5 | Chấm điểm nhân đôi, reveal, page gà route riêng, BXH sau câu | ✅ |
| B6 | 4 trợ giúp server-authoritative | ✅ |
| B7 | Tổng kết, BXH đầy đủ, chơi lại | ✅ |
| B8 | F5/reconnect resume (retry ack), lưu kết quả JSON, BXH all-time sống qua restart | ✅ |
| Admin | Người tạo phòng không chơi; dashboard BXH trực tiếp, kick/block/unblock | ✅ |

Single-player đã bị bỏ khỏi UI và source. Home còn **VÀO ĐẤU TRƯỜNG** → `/multiplayer` và **BXH** → `/leaderboard`; không còn `/game` hoặc `/result`.

## Trải nghiệm

- **User goal:** vào phòng bạn bè, trả lời 15 câu trên thiết bị của mình, thấy điểm/BXH ngay sau mỗi câu, chơi lại cùng phòng.
- **Hai vai trò:**
  - **Quản trò** (người tạo phòng): không có câu hỏi/đáp án, chỉ thấy mã/link, phase + đồng hồ, BXH trực tiếp, trạng thái từng người; có nút bắt đầu/chơi lại, kick, block/unblock, đóng phòng.
  - **Người chơi**: lobby chờ quản trò, trả lời câu hỏi, xem reveal/final; không có nút start/rematch/kick.
- **Primary action người chơi:** chọn một trong bốn đáp án; sau khi gửi, đáp án khóa và trợ giúp khóa.
- **Happy path:**
  1. Quản trò tạo phòng, copy mã/link; người chơi join.
  2. Quản trò `BẮT ĐẦU` khi ≥2 người chơi đang kết nối.
  3. Mỗi câu 15 giây; đáp án đúng chỉ hiện ở reveal; quản trò chỉ thấy “Câu n/15” + BXH.
  4. Reveal 6 giây: điểm cộng, đáp án đúng, giải thích, phân bố, top 5 + hạng của bạn.
  5. Sai/hết giờ: route `/multiplayer/chicken` nhanh 3 giây rồi về reveal; nhạc lose tiếp tục dưới reveal. Câu 15 bỏ page nhanh; final hạng >5 nhận page gà + nhạc lose đầy đủ.
  6. Hết 15 câu: podium, BXH đầy đủ, điểm/câu đúng/hạng; kết quả ghi all-time.
  7. Quản trò `CHƠI LẠI` → lobby, reset điểm/trợ giúp; người chơi chờ.
- **Edge cases:**
  - Mất kết nối: badge đỏ, đáp án khóa; Socket.IO tự thử lại vô hạn trong grace 60 giây rồi resume.
  - Refresh/F5: tự khôi phục phòng, câu, đáp án đã khóa, điểm, trợ giúp và vai trò (admin/player). Nếu ack resume bị mất, client tự thử lại 2 lần; token cũ/không hợp lệ thì xoá phiên và về form vào phòng.
  - All-time: kết quả final ghi JSON atomic; khởi động lại server vẫn hiển thị đúng trên `/leaderboard`.
  - Token hết hạn/hết grace: xoá phiên, hiện thông báo tiếng Việt và về màn vào phòng.
  - Gửi trùng: `ALREADY_ANSWERED`; UI giữ khóa.
  - Gửi trễ: `ANSWER_TOO_LATE`; UI chờ reveal.
  - 50:50: đáp án bị xoá hiện gạch ngang; server vẫn từ chối nếu cố gửi.
  - Bị kick: về màn vào phòng với thông báo “quản trò mời ra”; vào lại được khi phòng về lobby.
  - Bị block: về màn vào phòng với thông báo “bị chặn”; join lại nhận `PLAYER_BLOCKED` cho đến khi quản trò bỏ chặn.
  - Quản trò rời/hết grace: phòng đóng, người chơi nhận thông báo; không chuyển quyền quản trò.
  - Mở link mời ở tab thứ hai: tab mới vào như người chơi mới, không cướp token tab đầu (sessionStorage theo tab).

## Thành phần

| File | Vai trò |
|---|---|
| `src/pages/Home.tsx` | CTA đấu trường + nút BXH |
| `src/pages/Leaderboard.tsx` | BXH mọi thời đại từ `/api/leaderboard` |
| `src/pages/multi/Multiplayer.tsx` | entry, nhánh quản trò, lobby/game/reveal/final router + route page gà |
| `src/components/multi/AdminRoom.tsx` | dashboard quản trò: mã/link, phase/timer, BXH, kick/block/unblock |
| `src/components/multi/RoomLobby.tsx` | lobby người chơi, chờ quản trò bắt đầu |
| `src/multiplayer/useRoom.ts` | state phòng, câu, reveal, final, trợ giúp, admin actions, rematch, resume/F5 |
| `src/components/multi/MultiplayerGame.tsx` | câu hỏi, điểm, 4 đáp án, 4 trợ giúp |
| `src/components/multi/MultiplayerReveal.tsx` | đáp án đúng, giải thích, phân bố, BXH |
| `src/components/multi/ChickenLossPage.tsx` | page gà full-screen: nhanh 3 s khi sai giữa câu; full + nhạc lose khi final hạng >5 |
| `src/components/multi/MultiLifelines.tsx` | 4 nút trợ giúp, used/busy state |
| `src/components/multi/LifelineResultCard.tsx` | kết quả 50:50/phone/audience/MC |
| `src/components/multi/LeaderboardList.tsx` | hàng BXH dùng chung |
| `src/components/multi/MultiplayerFinal.tsx` | podium, BXH đầy đủ; hạng >5 không confetti/victory, chờ quản trò chơi lại |
| `src/components/multi/MultiQuestionTimer.tsx` | ring đồng hồ tách riêng |
| `server/game.ts` | scoring, reveal, final, lifeline validation |
| `server/lifelines.ts` | 4 generator server-only |

## Accessibility / responsive

- Touch target ≥44 px; đáp án mobile cao 61–66 px, nút trợ giúp 87×49 px.
- Nhóm đáp án có `role="group"` + `aria-label`; khóa/hết giờ dùng `aria-live="polite"`; lỗi dùng `role="alert"`.
- Page gà dùng `role="alert"`, nhãn tiếng Việt; bản giữa câu có progress nhanh, bản final có hạng/điểm và “Đang phát hết nhạc lose...”; tôn trọng `prefers-reduced-motion`.
- Mobile 390×844: `scrollW=390`, không tràn ngang; layout câu hỏi 1 cột, reveal/final/BXH cuộn dọc. Dashboard quản trò đưa BXH lên trước các thẻ mời/điều khiển để theo dõi ngay.
- Desktop: câu hỏi 2 cột; BXH và reveal bố trí 2 cột; dashboard quản trò 2 cột (điều khiển + BXH).
- F5 khi đang resume hiện màn “Đang khôi phục phiên phòng...” thay vì form vào phòng.

## Tối ưu latency

- Mỗi câu chỉ phát **một** `game:question` cho room; public packet dựng sẵn lúc start.
- Answer path O(1), không broadcast trạng thái từng người trả lời.
- Reveal/final phát riêng từng socket vì payload cá nhân.
- Tắt `perMessageDeflate` + `httpCompression`; buffer socket 64 KB.
- Đồng hồ trong `MultiQuestionTimer`; tick 1 giây chỉ re-render ring.
- Khóa local ngay khi bấm; chỉ chờ ack để xác nhận.
- Vite warmup + prefetch route `/multiplayer`.

## Lệnh test (một cổng)

```powershell
# Terminal 1 — server fast mode, đúng port 3001/5173
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run dev:full

# Terminal 2
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run test:flow
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run test:load
```

Resume test cần server/process cùng env:

```powershell
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='3000'; $env:REVEAL_MS='800'; $env:LOSE_MS='400'; $env:DISCONNECT_GRACE_MS='8000'; npm run test:resume
```

Sau khi test, chạy lại `npm run dev:full` **không env** để về 15 câu/15 giây/6 giây reveal/page gà nhanh 3 giây/page gà final 6,5 giây. Không mở port mới.
