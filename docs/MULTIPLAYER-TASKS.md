# Task list 2 ngày — MVP multiplayer 40 người

> **LƯU TRỮ (không phải trạng thái hiện tại).** Tài liệu này là kế hoạch ban đầu; B2–B7 đã xong và single-player đã bị bỏ. Xem [`MULTIPLAYER-SPEC.md`](./MULTIPLAYER-SPEC.md) để đọc đặc tả bản đang chạy.
>
> **Khác biệt so với kế hoạch:** bản chạy cuối cùng tách **quản trò** khỏi người chơi. Người tạo phòng không chơi, không nhận câu hỏi, chỉ theo dõi BXH trực tiếp và có quyền kick/block/unblock. Phòng vẫn tối đa **40 người chơi + 1 quản trò**. Ván hiện tại đã rút từ 20 xuống **15 câu**; các số 20 trong tài liệu lịch sử này chỉ là kế hoạch ban đầu.

> Thay thế bản task 8 phase trước đó. Bản này chỉ giữ **đúng 2 ngày** (16 giờ/người) và bám sát yêu cầu mới: phòng có mã, 40 người, 20 câu, điểm nhân đôi, sai hiện page gà + nhạc rồi đi tiếp, 4 menu trợ giúp giữ nguyên.
>
> Đặc tả chi tiết: [`MULTIPLAYER-SPEC.md`](./MULTIPLAYER-SPEC.md)

## Thay đổi so với bản task cũ

| Hạng mục | Bản cũ (55,5 người-ngày) | Bản 2 ngày |
|---|---|---|
| Thời gian | 7–8 tuần, 2 dev | **2 ngày**, 2 dev (hoặc 1 dev + cắt bớt) |
| Số câu | 10 | **20** |
| Điểm | Kẹo +2/câu | **Điểm nhân đôi: 1, 2, 4, …, 524.288** |
| Sai | Bị loại, hết game | **Page gà + nhạc → câu tiếp**, không loại |
| Host | Màn MC riêng | **Quản trò không chơi, chỉ theo dõi/kick/block** (chốt cuối) |
| Lưu trữ | PostgreSQL + Redis | **In-memory + JSON** |
| BXH | Trận/tuần/all-time | **Trận + cuối** (all-time là P1) |
| Trợ giúp | 4 menu | **Giữ nguyên 4 menu**, dữ liệu từ server |

---

## 0. Giả định & cảnh báo thời gian

- **2 ngày = 16 giờ/người**, chưa tính thời gian soạn câu hỏi.
- **Khuyến nghị 2 người**: 1 backend (Socket.IO/game loop) + 1 frontend (UI/socket client). Tổng 32 giờ.
- **1 người**: 16 giờ không đủ cho bản đầy đủ. Phải cắt reconnect, all-time BXH, QR, polish; xem §7. Nếu có thể, xin thêm 1 ngày hoặc thêm 1 người.
- **Không làm lại từ đầu**: tận dụng `QuestionStage`, `QuestionCard`, `AnswerButton`, `Timer`, `LifelinePanel`, `LifelineOverlays`, `soundManager`, `SettingsContext`.
- **Single-player giữ nguyên**, không refactor; multiplayer là chế độ mới.

### Phạm vi bắt buộc
1. Tạo phòng + mã 6 ký tự; join; tối đa 40.
2. Lobby + host start.
3. 20 câu × 15 giây; server chốt giờ.
4. Điểm nhân đôi; sai/hết giờ = 0 điểm.
5. Page gà + nhạc + tự tiếp tục.
6. 4 trợ giúp hoạt động, UI giữ nguyên.
7. BXH sau câu + BXH cuối.
8. Test 40 client giả.

### Cắt hẳn
- Màn MC/projector, spectator, late join.
- Tài khoản, chat, mùa giải, PostgreSQL/Redis, weekly BXH.
- Reconnect đầy đủ (chỉ làm nếu còn giờ), host transfer (P1).
- Single-player 20 câu/điểm.

---

## 1. Phân công & lịch ngày 1

### Backend (BE)
| Giờ | Việc | Task |
|---|---|---|
| 08:00–09:00 | Setup Express + Socket.IO + script chạy + proxy Vite | B1 |
| 09:00–11:00 | Room manager: tạo/join/mã/40 người/host | B2 |
| 11:00–12:00 | Lobby state + start + broadcast | B3 |
| 13:00–15:30 | Vòng đời câu hỏi, nhận answer, deadline | B4 |
| 15:30–17:00 | Chấm điểm nhân đôi + reveal + BXH | B5 |
| 17:00–18:00 | Bắt đầu trợ giúp: 50:50 + Hỏi MC | B6a |

### Frontend (FE)
| Giờ | Việc | Task |
|---|---|---|
| 08:00–09:30 | Socket client, types, hook, routes | F1 |
| 09:30–11:30 | Màn tạo phòng + vào phòng | F2 |
| 11:30–13:00 | Lobby: mã, danh sách, start | F3 |
| 13:00–15:30 | Màn chơi: câu hỏi, đáp án, điểm, câu x/20 | F4 |
| 15:30–16:30 | Đồng hồ theo `endsAt`, khóa đáp án sau khi gửi | F5 |
| 16:30–18:00 | Ghép với BE; test 2 client tạo/join/start/câu 1 | — |

**Checkpoint cuối ngày 1 (18:00):**
- Tạo phòng → có mã; 2 client join được; host start được.
- Cả 2 nhận cùng câu 1, cùng `endsAt`; bấm đáp án → server nhận; hết giờ → reveal có điểm.
- Nếu chưa đạt: tối làm bù hoặc cắt bớt (xem §6).

---

## 2. Phân công & lịch ngày 2

### Backend
| Giờ | Việc | Task |
|---|---|---|
| 08:00–09:30 | Hoàn tất trợ giúp: Gọi điện + Khán giả | B6b |
| 09:30–11:00 | Final + sort + ghi JSON + rematch | B7 |
| 11:00–12:30 | Bot 40 client; sửa lỗi tranh chấp | B9 |
| 13:30–15:00 | (P1) Reconnect/resume nếu còn giờ | B8 |
| 15:00–16:00 | Production serve + README + build | B10 |
| 16:00–18:00 | Fix integration + demo | — |

### Frontend
| Giờ | Việc | Task |
|---|---|---|
| 08:00–09:30 | Page gà + nhạc + auto-continue | F6 |
| 09:30–11:00 | Điểm + bảng 20 nấc | F7 |
| 11:00–12:30 | Reveal + BXH live + hạng của bạn | F8 |
| 13:30–15:00 | BXH cuối + podium + chơi lại | F9 |
| 15:00–16:30 | Polish mobile + fix integration | F10 |
| 16:30–18:00 | Demo 2 máy + 40 bot | — |

**Checkpoint cuối ngày 2 (16:00):**
- Một ván 20 câu chạy trọn; sai → gà + nhạc → câu tiếp; final BXH đúng.
- 40 bot chạy xong không crash; không lộ đáp án.
- `npm run build` + `npm start` chạy được.

**Demo 18:00:** 1 laptop tạo phòng, 2–3 điện thoại join; chạy `QUESTION_COUNT=5 QUESTION_MS=15000` để demo nhanh 5 câu + final, sau đó chơi thử 20 câu nếu còn giờ.

---

## 3. Task chi tiết

### Backend

| ID | Task | Est | Deps | Acceptance |
|---|---|---:|---|---|
| **B1** | Setup server: Express, Socket.IO, `tsx`, `concurrently`, script `server` + `dev:full`, proxy Vite `/socket.io`; tạo `multiplayerConfig` dùng chung | 1h | — | `npm run server` chạy cổng 3001; `npm run dev:full` chạy cả Vite + server; client connect được; `pointsForLevel` import được từ server |
| **B2** | Room manager: tạo mã 6 ký tự, join, max 40, host, leave | 2h | B1 | Tạo 20 phòng không trùng mã; người 41 nhận `ROOM_FULL`; join sai mã nhận `ROOM_NOT_FOUND` |
| **B3** | Lobby: broadcast `room:state`, start khi ≥2, chỉ host | 1h | B2 | 2 client thấy nhau; client thường bấm start bị chặn; start đổi status `playing` |
| **B4** | Game loop: bốc 20 câu, phát câu, deadline 15s, nhận answer; env `QUESTION_MS`/`QUESTION_COUNT` cho test/demo | 2,5h | B3 | 20 câu không lặp; `game:question` không có `correct`; answer trùng/trễ bị chặn; tất cả cùng `endsAt`; env override chạy được |
| **B5** | Scoring: `2^(n-1)`, reveal, sort BXH | ✅ | B4 | Q1=1, Q2=2, Q20=524.288; tổng đúng; `rank` khớp sort; tie-break đúng; `npm run test:scoring` |
| **B6a** | Trợ giúp 50:50 + Hỏi MC | ✅ | B4 | 2 đáp án sai bị ẩn; MC luôn gợi ý sai; mỗi loại 1 lần/người; payload không lộ đáp án thật |
| **B6b** | Trợ giúp Gọi điện + Khán giả | ✅ | B6a | Phone luôn gợi ý sai; audience % tổng 100; dùng lại bị chặn; không lộ `correctIndex` |
| **B7** | Final: sort, `game:end`, ghi `results.json`, rematch | ✅ | B5 | BXH đủ 40; rematch reset điểm/câu; file JSON đọc được; flow test final + rematch |
| **B8** | Reconnect token + JSON results + all-time | ✅ | B7 | F5 trong 60s vào lại đúng phòng/câu/điểm; quản trò hết grace đóng phòng (không chuyển quyền); all-time còn sau restart |
| **B9** | Bot 40 client + test tải + fix | ✅ | B7 | 1 quản trò + 40 bot join/answer/final (3 câu và đủ 20 câu); chặn người thứ 41; dashboard 40 dòng; p95 broadcast 4–7ms (<300ms) |
| **B10** | Production: serve `dist`, script `start`, README | ✅ | B9 | Node >= 20; `npm run build && npm start` mở 3001 chơi được; `npm run test:prod` kiểm tra asset/API/SPA/audio/socket; asset thiếu 404; `tsx` là prod dependency; README có env/data/reverse proxy |
| **B11** | Page gà nhanh giữa câu + page gà final ngoài top 5 | ✅ | B5 | Route `/multiplayer/chicken` 3s rồi về reveal, nhạc lose tiếp tục dưới reveal; final hạng >5 page gà full + nhạc lose rồi BXH, top 5 final thường |
| **B12** | Quản trò không chơi + dashboard + kick/block | ✅ | B7 | Người tạo nhận role admin; không nhận câu/reveal; dashboard BXH trực tiếp; kick/block/unblock có test riêng |

### Frontend

| ID | Task | Est | Deps | Acceptance |
|---|---|---:|---|---|
| **F1** | Socket client + types + `useRoom` + routes + `multiplayerConfig` | 1,5h | B1 | Connect/disconnect sạch; route `/create`, `/join`, `/room/:code` chạy; type/config dùng chung |
| **F2** | Create/Join UI | 2h | F1 | Tạo phòng hiện mã to; nhập 6 ô mã auto-next; lỗi mã/đầy phòng rõ |
| **F3** | Lobby UI: mã, link, lưới 40, start | 1,5h | F1, B3 | 40 avatar không vỡ layout; host thấy nút start; player thấy “chờ host” |
| **F4** | GameRoom: câu hỏi, 4 đáp án, điểm, câu x/20, trợ giúp; bọc `TimerProvider` + reuse `QuestionStage` | 2,5h | F1, B4 | Bấm 1 lần; khóa sau khi gửi; hiện đúng câu; sau reveal merge `correctIndex` để hiện giải thích |
| **F5** | Đồng hồ theo `endsAt` server | 1h | F4 | Tính `offset` từ `serverNow`; set `remaining` mỗi 250ms; không lệch quá 1s; hết giờ khóa nút; không pause khi mở overlay trợ giúp |
| **F6** | Page gà nhanh + final ngoài top 5 | 1,5h | F4, B5 | Sai/hết giờ mở `/multiplayer/chicken` 3s (trừ câu 20); nhạc lose tiếp tục dưới reveal; final hạng >5 page gà full 6,5s + nhạc lose rồi BXH |
| **F7** | Điểm + bảng 20 nấc | 1,5h | F4, B5 | Hiện 1 → 524.288; format `vi-VN`; panel cuộn được; mobile thu gọn |
| **F8** | Reveal + BXH live | 1,5h | F5, B5 | Đáp án đúng, phân bố, +điểm, top 5, hạng của bạn; không tự sort |
| **F9** | Final board + podium + chơi lại | 1,5h | B7 | Đủ 40 dòng; top 3 đúng; host rematch; player về home |
| **F10** | Polish mobile + fix integration | ✅ | tất cả | 360px không vỡ; không console error; reconnect banner + F5 resume |
| **F11** | All-time leaderboard + reconnect UI | ✅ | F9 | `/leaderboard` đọc API, Home có nút BXH; resume loading/error rõ |
| **F12** | Admin dashboard + kick/block UI | ✅ | F9, B12 | Mã/link, phase/timer, BXH 40 dòng, xác nhận kick/block, danh sách chặn + bỏ chặn; mobile BXH lên trước |

### Nội dung

| ID | Task | Est | Deps | Acceptance |
|---|---|---:|---|---|
| **C1** | Thêm 15 câu hỏi (đủ 30) | 2h | — | JSON valid; `correct` 0..3; không trùng id/nội dung; 20 câu/ván không lặp |
| **C1-min** | Nếu không kịp: thêm 5 câu (đủ 20) | 1h | — | Đủ 20 câu cho một ván; chấp nhận ít biến thiên |

> C1 nên làm **trước ngày 1** hoặc buổi tối ngày 1. Nếu là 1 người, C1-min là phương án bắt buộc.

---

## 4. Thứ tự code đề xuất (critical path)

```
B1 → B2 → B3 → B4 → B5 → B7 → B6a → B6b → B9 → B10
F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → F10
```

- **Không làm F6/F7 trước khi B5 xong** — cần payload reveal/score thật.
- **B6 (trợ giúp) làm sau core** — nếu kẹt, core vẫn demo được; nhưng phải xong trước demo vì yêu cầu giữ menu.
- **B8 (reconnect) đã hoàn thành và nghiệm thu** — token xoay vòng, grace 60s, F5 resume; ack mất thì client retry 2 lần; quản trò hết grace đóng phòng (không chuyển quyền); all-time còn nguyên sau khi restart server; có test riêng.

---

## 5. Test plan

### Thủ công (2 máy)
1. Laptop tạo phòng → mã; điện thoại join.
2. Host start; kiểm tra cùng câu, cùng giờ.
3. Trả lời đúng/sai; xem điểm nhân đôi.
4. Sai → page gà nhanh 3s + nhạc lose tiếp tục dưới reveal → câu tiếp (không bị loại); hết câu 20, hạng >5 → page gà full + nhạc lose.
5. Dùng 4 trợ giúp; thử dùng lại (bị chặn).
6. Hết 20 câu → BXH; host rematch.

### Bot 40 client
- Script `server/scripts/bots.ts`:
  - 1 host tạo phòng; 39 client join.
  - Mỗi client trả lời ngẫu nhiên; log nhận câu/reveal/final.
  - Chạy với `QUESTION_MS=1500` để test nhanh (env override).
- Assert:
  - [ ] 40 join OK; người 41 bị chặn.
  - [ ] Tất cả nhận 20 câu, cùng `endsAt`.
  - [ ] `game:question` không có `correct`.
  - [ ] Gửi 2 answer → lần 2 bị chặn.
  - [ ] Final có 40 dòng, rank 1..40.
  - [ ] Server không crash, RAM ổn định.

### Build
- `npx tsc --noEmit`
- `npm run build`
- `npm start` → mở `http://localhost:3001`, chơi 2 tab.

---

## 6. Checkpoint & tiêu chí dừng

| Thời điểm | Phải có | Nếu chưa |
|---|---|---|
| D1 12:00 | Tạo/join phòng qua socket; 2 client thấy nhau | Tối làm bù B2/B3; F2 chuyển sang ghép API thật |
| D1 18:00 | Start + câu 1 + answer + reveal điểm | Cắt B6, B8; tối làm bù B4/B5 |
| D2 12:00 | Vòng 20 câu + page gà + final (có thể qua bot) | Cắt B8, all-time, QR; dồn FE vào core |
| D2 16:00 | 40 bot pass + build production | Cắt podium/animation; giữ BXH dạng list |
| D2 18:00 | Demo 2 máy | Demo phần đã có; ghi rõ phần chưa xong |

**Quy tắc cắt:** nếu một task trễ > 1 giờ, cắt phần “should” tương ứng, không cắt core (join/20 câu/điểm/gà/final).

---

## 7. Phương án 1 người (nếu không có ai làm cùng)

2 ngày × 11–12 giờ = 22–24 giờ. Cắt:
- B8 reconnect/host transfer.
- All-time BXH, QR code (chỉ link/mã).
- Podium/animation; final dùng list.
- C1-min (5 câu mới) thay vì 15.
- Bot test: chỉ 10 client, không 40.

Thứ tự:
1. B1→B2→B3→B4→B5 (6h)
2. F1→F2→F3→F4→F5 (7h)
3. B6a→B6b (2h)
4. F6→F8 (3h); F9 list đơn giản (1h)
5. B7→B9 (10 client)→B10 (3h)
6. Test/demo (1–2h)

Tổng ~22–23h — vẫn là 2 ngày rất dài, không có buffer. Nếu có thể, nhờ thêm 1 người hoặc xin thêm 1 ngày.

Nếu vẫn chậm: ship **join + 20 câu + điểm + page gà + final list**, trợ giúp để “coming soon” — nhưng như vậy không đúng yêu cầu “menu không đổi”; phải báo trước với người dùng.

---

## 8. Rủi ro & contingency

| Rủi ro | Dấu hiệu | Xử lý |
|---|---|---|
| Socket.IO + Vite proxy lỗi | Client không connect | Dùng URL tuyệt đối `http://localhost:3001`; kiểm tra CORS |
| 40 người bấm cùng lúc | Answer trễ, crash | Server xử lý tuần tự; test bot; giới hạn 1 answer |
| Lộ đáp án | Payload có `correct` | Test sniff; chỉ gửi `correctIndex` ở reveal |
| Page gà che câu tiếp | Page không tắt | Page nhanh 3s (trừ câu 20); nhạc lose chạy dưới reveal; câu mới reset state + stop nhạc |
| Nhạc thua không phát | AudioContext chưa unlock | Bắt gesture ở nút start/join; gọi `unlockAudio()` |
| Hết câu hỏi | Ván 20 câu lặp | C1 trước; tối thiểu 20 câu unique |
| Host thoát giữa trận | Phòng treo | P1 host transfer; nếu không, trận vẫn chạy, host mất quyền |
| `dist` cũ | Không thấy code mới | Build lại trước demo; không copy dist cũ |

---

## 9. Definition of Done (2 ngày)

- [ ] `npm run dev:full` chạy Vite + server; `npm run build && npm start` chạy production.
- [ ] Tạo phòng → mã → 2 client join → start → 20 câu → final.
- [ ] Điểm đúng 1,2,4,…,524.288; BXH đúng.
- [x] Sai/hết giờ → page gà nhanh + nhạc lose dưới reveal → câu tiếp; không loại; final hạng >5 page gà full.
- [ ] 4 trợ giúp dùng được, UI không đổi.
- [ ] 40 bot join/answer/final không crash.
- [ ] Không lộ `correct` trước reveal.
- [ ] Mobile 360px bấm được đáp án.
- [ ] README hướng dẫn chạy + demo.

---

## 10. Việc làm ngay (30 phút đầu)

1. Chốt 3 con số: **20 câu**, **15 giây/câu**, **câu 1 = 1 điểm** (đổi 1 hằng số nếu muốn).
2. Cài `socket.io`, `socket.io-client`, `express`, `tsx`; thêm script `server`.
3. Tạo `server/index.ts` + `server/rooms.ts` rỗng; chạy thử cổng 3001.
4. Tạo `src/types/multiplayer.ts` + `src/multiplayer/socket.ts`.
5. Thêm route `/create`, `/join`, `/room/:code` (placeholder) — đảm bảo không đụng single-player.
6. Soạn 5 câu hỏi mới trước, để C1 không chặn code.

> Nếu bạn xác nhận, tôi bắt đầu ngay **B1 + B2** (server tạo phòng có mã, join tối đa 40) — đây là thứ cần có trước để mọi người vào test.
