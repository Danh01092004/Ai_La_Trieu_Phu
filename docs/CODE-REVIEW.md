# Báo cáo kiểm tra mã nguồn — AI LÀ TRIỆU PHÚ (single-player)

> **LƯU TRỮ (không phải trạng thái hiện tại).** Báo cáo này viết cho bản single-player trước đây; route/source single-player đã bị xoá. Xem [`MULTIPLAYER-SPEC.md`](./MULTIPLAYER-SPEC.md) cho bản multiplayer đang chạy.

- **Ngày:** 11/11/2026
- **Phạm vi:** toàn bộ `src/` (61 tệp TS/TSX, ~5.677 dòng), `public/`, cấu hình Vite/Tailwind/TS, bản build `dist/`
- **Cách kiểm tra:** đọc mã + `tsc --noEmit` + `vite build` + chạy thật trên Chromium (Playwright), đo trực tiếp các `AudioBufferSourceNode` được Web Audio phát ra
- **Kết luận ngắn:** game chạy đúng trọn vòng chơi (thắng, sai, hết giờ, chơi lại). **Âm thanh thua hoạt động trong source**; nguyên nhân bạn không nghe thấy nằm ở **bản `dist/` cũ chưa được build lại**, không phải ở code.

---

## 1. Tóm tắt điều hành

1. **Đã kiểm chứng âm thanh thua** (`xin-vinh-biet-cu.mp3`) trên cả dev server và bản production mới:
   - Khi trả lời sai hoặc hết giờ, Howler tạo một nguồn phát dài **6,11 giây**, 48 kHz, stereo — đúng bằng độ dài file MP3.
   - File giải mã thành công, có nội dung thật (peak ≈ 0,43; RMS ≈ 0,106), không phải file im lặng hay file hỏng.
2. **Nguyên nhân "mất sound" trong bản build bạn đang chạy:** thư mục `dist/` được build lúc **10/11/2026 13:41**, trước các thay đổi âm thanh. Bundle cũ **không hề chứa** chuỗi `xin-vinh-biet-cu` hay `playLoseMusic`. Sau khi `npm run build` lại, bundle mới có đầy đủ và đã test lại: tiếng "Xin vĩnh biệt cụ" phát đúng khi thua.
3. **Đã sửa một lỗi audio thật:** hiệu ứng fade-out nhạc nền trước đây **không bao giờ pause** (điều kiện trong callback bị ngược), và hai lần fade chồng nhau có thể tranh nhau gain. Nay: fade → pause thật → resume sạch khi chơi lại (đã test bằng log `[Audio] Background pause (after fade)` → `[Audio] Background resumed`).
4. **Ba việc P1 còn mở**, nên xử lý trước khi làm multiplayer:
   - Route `/result` và `scoreStore` (high score) **không được nối vào UI** ⇒ kỷ lục local không bao giờ được lưu.
   - Vào thẳng `#/game` (refresh/deep-link) không có user gesture ⇒ AudioContext bị treo ⇒ **mất toàn bộ âm thanh**, kể cả tiếng thua.
   - Ngân hàng câu hỏi chỉ có **15 câu** (10 easy + 5 hard), thiếu medium/very_hard ⇒ trọng số độ khó và xác suất của trợ giúp không cân, chơi lại rất dễ lặp câu.

---

## 2. Bằng chứng kiểm thử

### 2.1. Build & typecheck

| Hạng mục | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ 0 lỗi |
| `npm run build` | ✅ thành công (451 modules, ~4,6 s) |
| Bundle lớn nhất | `vendor-react` 160 kB (52 kB gzip), `vendor-framer` 115 kB (38 kB gzip) |
| `dist` chứa MP3 | ✅ `nhac-xo-so.mp3`, `xin-vinh-biet-cu.mp3` |

### 2.2. Kịch bản chạy thật (Chromium)

| Kịch bản | Kết quả quan sát |
|---|---|
| Home → CHƠI NGAY | ✅ intro 2,2 s → câu 1, nhạc nền bắt đầu |
| Nhạc nền | ✅ buffer **17,39 s** được phát, loop |
| Hết giờ ở câu 1 | ✅ hiện "Hết giờ mất rồi!", nguồn **6,11 s** (bài thua) được phát |
| Chọn sai đáp án | ✅ reveal đáp án đúng, nguồn **6,11 s** (bài thua) được phát; popup thua sau ~2,4 s |
| Chơi lại | ✅ session mới, nhạc nền resume, overlay reset |
| Trả lời đúng cả 10 câu | ✅ ContinueModal sau mỗi câu, kết thúc "CHÚC MỪNG!", **20 kẹo** |
| Nút "Trang chủ" | ✅ dừng nhạc, dừng bài thua, về Home, nhạc lobby phát lại |
| Overlay trợ giúp | 🟡 mới kiểm tra bằng đọc mã (pause/resume timer, auto-close) |

### 2.3. Số liệu âm thanh (đo trong trang)

| File | Thời lượng decode | Kênh | Sample rate | Peak | RMS | HTTP |
|---|---:|---:|---:|---:|---:|---:|
| `xin-vinh-biet-cu.mp3` | 6,109 s | 2 | 48 kHz | 0,427 | 0,106 | 200 |
| `nhac-xo-so.mp3` | 17,386 s | 2 | 48 kHz | 0,754 | 0,083 | 200 |

Timeline audio ghi được (dev):
- ~14,9 s: whoosh 0,30 s (bấm CHƠI NGAY)
- ~16,4 s: nhạc nền 17,39 s
- ~49,3 s: SFX sai 0,45 s → **bài thua 6,11 s** (hết giờ)
- ~182,4 s: SFX sai 0,45 s → **bài thua 6,11 s** (chọn sai)

Bản production (sau rebuild): chọn sai → **bài thua 6,11 s** được phát; bundle `index-*.js` có chuỗi `xin-vinh-biet-cu`.

> Lưu ý: môi trường headless không đo được âm lượng loa thực tế, nhưng nguồn phát đã được schedule trên AudioContext đang chạy và dữ liệu giải mã không im lặng — đủ để kết luận code phát bài thua đúng.

---

## 3. Ma trận chức năng

Ký hiệu: ✅ đã chạy thật · 🟡 đọc mã, logic đúng · ⚠️ có vấn đề · ⛔ lỗi/thiếu

| # | Chức năng | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Router Home / Game / Result | ⚠️ | `/result` không có điểm vào |
| 2 | Bắt đầu game + intro | ✅ | 2,2 s, chống double-start bằng `startedRef` |
| 3 | Timer 30 s, pause/resume | ✅ | rAF, pause khi mở settings/overlay |
| 4 | Chọn đáp án + ripple + khóa | ✅ | disable đúng phase |
| 5 | Reveal đáp án + giải thích | ✅ | 2,6 s |
| 6 | Đúng → Continue / Dừng | ✅ | ContinueModal hiện sau 1,6 s |
| 7 | Sai → popup thua | ✅ | delay 2,4 s để thấy reveal |
| 8 | Hết giờ → popup thua | ✅ | delay 0,4 s |
| 9 | Thắng 10/10 | ✅ | "CHÚC MỪNG!", 20 kẹo |
| 10 | Chơi lại | ✅ | session key mới, timer/audio reset |
| 11 | Về trang chủ | ✅ | dừng audio, clear result |
| 12 | Nhạc nền (loop, fade) | ✅ | đã sửa lỗi pause sau fade |
| 13 | Nhạc thua "Xin vĩnh biệt cụ" | ✅ | dev + prod, khi sai & hết giờ |
| 14 | 50:50 | 🟡 | xóa 2 đáp án sai, giữ đáp án đúng |
| 15 | Gọi điện cho bạn | 🟡 | overlay 30 s, gợi ý sau 8 s, auto-close sau 4 s |
| 16 | Khán giả (troll) | 🟡 | cộng đúng 100 %, winner theo difficulty |
| 17 | Hỏi MC (luôn sai) | 🟡 | theo `MC_ALWAYS_WRONG = true` |
| 18 | Timer pause khi mở overlay | 🟡 | `activate()` pause, `resumeIfPlaying()` resume |
| 19 | Settings (music/sfx/volume/fullscreen) | ✅ | lưu localStorage, áp dụng tức thì |
| 20 | ESC đóng modal | 🟡 | Modal có listener |
| 21 | Kỷ lục local / bảng xếp hạng | ⛔ | `Result` không được điều hướng tới ⇒ không lưu |
| 22 | Deep-link vào `#/game` | ⚠️ | audio bị treo do autoplay policy |
| 23 | Responsive mobile | 🟡 | dùng `clamp`, grid; chưa test thiết bị thật |
| 24 | Reduced motion | 🟡 | CSS tắt spotlight/border; Framer vẫn chạy |
| 25 | Build/typecheck | ✅ | 0 lỗi |

---

## 4. Phát hiện chi tiết

### F-01 — `dist/` cũ không có bài thua (P0, đã sửa)
- **Hiện tượng:** chạy bản build trong `dist/` thì không có tiếng khi thua.
- **Nguyên nhân:** `dist` được tạo trước khi thêm code âm thanh; grep bundle cũ không có `xin-vinh-biet-cu`/`playLoseMusic`.
- **Xử lý:** `npm run build` lại. Bundle mới có bài thua; đã test lại trên bản production.
- **Lưu ý nội dung:** file hiện tại chỉ dài **6,1 giây** (có thể là một đoạn clip, không phải cả bài). Nếu muốn dùng bản dài hơn, chỉ cần thay `public/xin-vinh-biet-cu.mp3` — code tự dùng độ dài mới, không cần sửa gì.
- **Lưu ý vận hành:** mỗi lần deploy phải build lại; đừng copy `dist` cũ. Nên thêm CI build + hash kiểm tra.

### F-02 — `stopMusic()` không bao giờ pause sau fade (P1, đã sửa)
- **Vị trí:** `src/theme/sounds/soundManager.ts:211` (trước khi sửa).
- **Lỗi:** callback `howl.once('fade', …)` kiểm tra `!howl.playing(id)` — tại thời điểm fade kết thúc, sound vẫn đang "playing" (volume 0) nên điều kiện luôn sai ⇒ nhạc nền tiếp tục chạy câm mãi mãi.
- **Lỗi phụ:** Howler chỉ tự hủy fade khi gọi `fade()` **không** truyền id; code truyền id nên hai fade có thể chồng nhau và tranh gain.
- **Đã sửa:** hủy fade đang chạy bằng cách set lại volume; hẹn giờ pause sau fade bằng timer có thể hủy; `startMusic()` hủy timer đó và resume sạch.
- **Kiểm chứng:** log `Background fade` → `Background pause (after fade)` → `Background resumed` → `Background play` khi bấm Chơi lại.

### F-03 — `/result` và high score là code chết (P1, chưa sửa)
- **Vị trí:** `src/App.tsx:22`, `src/pages/Result.tsx:17-23`, `src/state/scoreStore.ts`.
- **Vấn đề:** không có chỗ nào gọi `navigate('/result')`; `saveHighScore()` chỉ nằm trong `Result`. Người chơi chỉ vào được route này nếu tự sửa URL sau khi ván đã kết thúc (lúc đó context còn), còn nếu refresh thì context = null và bị đẩy về Home. Vì vậy trong luồng bình thường **kỷ lục không bao giờ được lưu** và Home không hiển thị kỷ lục.
- **Đề xuất:** hoặc bỏ route/`scoreStore`, hoặc lưu high score ngay khi kết thúc trong `Game.tsx` và thêm khối "Kỷ lục" ở Home. Với multiplayer, thay bằng bảng xếp hạng server.

### F-04 — Mất audio khi vào thẳng `#/game` (P1, chưa sửa)
- **Vị trí:** `src/pages/Game.tsx:65-75`, `src/theme/sounds/soundManager.ts:82-100`.
- **Vấn đề:** `unlockAudio()` được gọi trong `useEffect`, không phải user gesture. Nếu người chơi refresh hoặc mở link trực tiếp vào game, AudioContext nằm ở trạng thái `suspended`; `startMusic()` và `playLoseMusic()` không thể phát. Người chơi phải bấm gì đó — mà code không có cơ chế unlock lại/khởi động nhạc sau đó.
- **Đề xuất:** (a) gắn listener `pointerdown`/`keydown` một lần ở `SettingsProvider` để unlock; (b) sau khi unlock, nếu đang trong ván thì gọi `startMusic()`; (c) với multiplayer, thêm nút "Chạm để sẵn sàng" ở lobby để vừa unlock audio vừa xác nhận ready.

### F-05 — Ngân hàng câu hỏi quá mỏng và lệch độ khó (P2)
- **Vị trí:** `src/data/questions.json` (15 câu: 10 easy, 5 hard), `src/config/gameConfig.ts:9` (10 câu/ván).
- **Ảnh hưởng:** mỗi ván bốc 10/15 ⇒ xác suất lặp câu giữa các ván rất cao; không có medium/very_hard nên các bảng xác suất trong `services/lifeline.ts` gần như không dùng tới.
- **Đề xuất:** tối thiểu 120 câu cho MVP, 300+ khi ra mắt; phân bổ 30 % easy / 35 % medium / 25 % hard / 10 % very_hard; thêm `category`, `mediaUrl`, `status`; validate bằng schema (Zod) trong CI.

### F-06 — Cân bằng trợ giúp đang "troll" khá nặng (P2, cần quyết định thiết kế)
- **Vị trí:** `src/config/gameConfig.ts:58-65`.
- **Hiện tại:** MC **luôn** gợi ý sai; khán giả đúng 30–80 % tùy độ khó. Với người chơi mới/ lớp học, trải nghiệm có thể ức chế.
- **Đề xuất:** giữ troll cho chế độ giải trí, thêm cấu hình `fairMode` (MC 60 %, khán giả 70–85 %) hoặc để host chọn khi tạo phòng multiplayer.

### F-07 — Không có test tự động (P2)
- Không có Vitest/Playwright test; `npm run lint` chỉ là `tsc --noEmit`.
- **Đề xuất:** unit test cho `gameReducer`, `guaranteedCandies`, `computeAudienceVote` (tổng = 100), scoring multiplayer; e2e cho luồng thắng/thua/retry. Đây là điều kiện tiên quyết để port engine sang server.

### F-08 — Không validate dữ liệu câu hỏi (P2)
- `questions.json` được cast thẳng `as Question[]` (`src/services/questionManager.ts:6`). Một câu thiếu `answers[3]` hoặc `correct` ngoài 0..3 sẽ làm UI/engine sai mà không báo.
- **Đề xuất:** Zod schema + script `npm run validate:questions` chạy trong CI.

### F-09 — Phase/type chết (P3)
- `GamePhase` có `'intro'` và `'reveal'` (`src/types/index.ts:28-38`) nhưng engine không dùng; UI tự quản intro bằng state riêng. Không gây lỗi, nhưng dễ gây nhầm khi mở rộng multiplayer.
- **Đề xuất:** dọn type hoặc dùng phase thật.

### F-10 — Tiếng gà có thể lấn át bài thua (P3, UX)
- `LosePopup` phát 8 tiếng gà trong 3,5 s đầu (`src/components/LosePopup.tsx:31-34,67-71`) ngay trên bài thua vừa bắt đầu. Nếu bạn thấy bài thua "không rõ", đây là lý do cảm nhận.
- **Đề xuất:** giảm còn 4 tiếng, hạ gain, hoặc bắt đầu sau 1,2 s; hoặc duck bài thua xuống 0,6 trong lúc gà kêu.

### F-11 — Accessibility (P3)
- Modal chưa trap focus; timer không có `aria-live`; chưa có phím tắt A/B/C/D; nút icon Home có `aria-label` tốt nhưng overlay chưa có `role="dialog"`.
- **Đề xuất:** bổ sung trước khi dùng trong lớp học đông người.

### F-12 — Timer dùng rAF và tab nền (P3)
- `CountdownTimer` dùng `requestAnimationFrame` (`src/services/timer.ts`), nên khi tab bị ẩn, tick bị treo; khi quay lại, `performance.now()` nhảy và có thể timeout ngay. Không phải lỗi bảo mật ở single-player, nhưng **multiplayer bắt buộc dùng deadline server**, không dùng đồng hồ client.

### F-13 — `TIMEOUT` được chấp nhận ở phase `locked` (P3)
- `src/services/gameEngine.ts:145` cho phép timeout khi đang `locked`. Trên thực tế timer đã dừng ở phase này nên khó xảy ra; nên siết lại để tránh trạng thái sai nếu sau này có nguồn timeout khác.

### F-14 — Ripple setState sau unmount (P4)
- `AnswerButton` đặt `setTimeout` 650 ms không cleanup (`src/components/AnswerButton.tsx:52`). Không crash trên React 18, nhưng nên lưu id và clear.

### F-15 — Toggle "Nhạc nền" không tắt bài thua (P3, cần quyết định)
- `playLoseMusic()` không kiểm tra `settings.music` (`soundManager.ts:247`). Nếu người chơi tắt nhạc, tiếng thua vẫn phát. Có thể là chủ ý (âm thanh kịch tính), nhưng nên ghi rõ trong spec hoặc tách thành "Âm thanh chương trình".

---

## 5. Những điểm đang làm tốt

- **Kiến trúc tách lớp rõ:** `gameEngine` là reducer thuần; `useGame` điều phối; page chỉ compose UI. Rất thuận lợi để tái sử dụng engine cho server multiplayer.
- **Hiệu năng render:** `TimerContext` tách tick 1 Hz khỏi cây game; `useSettingsActions` tách callback ổn định khỏi state; nhiều component `memo`.
- **Audio singleton được bảo vệ:** `_bgHowl`/`_bgSoundId` ở module scope, chịu được StrictMode; idempotent `startMusic()`.
- **Trải nghiệm hình ảnh:** Framer Motion + CSS animation có `prefers-reduced-motion`; chicken flock đã được giảm từ 26 → 13.
- **Build chunk hợp lý:** vendor react/framer/howler tách riêng, lazy-load Game/Result.
- **Không có lỗi TypeScript**, không có `any` bừa bãi đáng kể.

---

## 6. Checklist trước khi chuyển sang multiplayer

- [x] Build lại `dist` để bản production có tiếng thua
- [x] Sửa fade/pause nhạc nền
- [ ] Chốt: giữ hay bỏ `/result` + `scoreStore`; nếu giữ thì lưu high score ngay khi kết thúc
- [ ] Thêm unlock audio bằng gesture + resume nhạc sau unlock
- [ ] Mở rộng ngân hàng câu hỏi + schema validation
- [ ] Viết unit test cho engine/scoring trước khi port sang server
- [ ] Tách `gameEngine` + types thành package dùng chung client/server
- [ ] Quyết định chế độ troll/fair và cấu hình theo phòng
- [ ] Đo lại trên mobile thật (360×640) và Safari/Firefox

---

## 7. Giới hạn của lần kiểm tra

- Chưa thử **từng overlay trợ giúp** bằng tay (50:50, gọi điện, khán giả, MC) — mới đọc mã và xác nhận luồng pause/resume.
- Chưa test trên **Safari/Firefox**, thiết bị mobile thật, screen reader.
- Chưa test **mất mạng/refresh giữa ván** (single-player không có khái niệm này; sẽ là hạng mục bắt buộc của multiplayer).
- Chưa đo CPU/FPS khi bật toàn bộ hiệu ứng trên máy yếu.

---

## 8. Cách tự kiểm tra nhanh tiếng thua

1. `npm run dev` → mở `http://localhost:5173`.
2. Bấm **CHƠI NGAY**, để hết 30 giây hoặc chọn sai một đáp án.
3. Mở DevTools → Network → thấy `xin-vinh-biet-cu.mp3` được tải (200) ngay sau khi reveal.
4. Console có `[Audio] Background fade` rồi (sau ~0,9 s) `[Audio] Background pause (after fade)`.
5. Nếu chạy bản `dist`, nhớ `npm run build` trước khi serve.
