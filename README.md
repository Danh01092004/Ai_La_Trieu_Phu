# AI LÀ TRIỆU PHÚ — Multiplayer 40 người

Game trắc nghiệm realtime: một phòng tối đa **40 người chơi + 1 quản trò**, mã **6 ký tự**, **15 câu × 15 giây**, điểm nhân đôi mỗi câu, 4 trợ giúp, page gà riêng, bảng xếp hạng sau từng câu/final và **BXH all-time lưu bền trên server**.

Người tạo phòng là **quản trò**, không chơi: chỉ theo dõi BXH/hạng/trạng thái trực tiếp, bắt đầu/chơi lại, mời người chơi ra hoặc chặn/bỏ chặn.

## Chạy development

```powershell
npm install
npm run dev:full
```

Mở **http://localhost:5173**. Server Socket.IO chạy cùng lúc ở **http://localhost:3001**; Vite proxy `/socket.io`, `/api` sang server.

- Quản trò: nhập tên → **TẠO PHÒNG** → copy mã/link, theo dõi BXH trực tiếp.
- Người chơi: mở link hoặc nhập mã 6 ký tự → **VÀO PHÒNG**.
- Quản trò bấm **BẮT ĐẦU** khi có ít nhất 2 người chơi đang kết nối.
- Trong phòng, quản trò có thể **mời ra** (vào lại được khi phòng về lobby) hoặc **chặn** theo tên/trình duyệt cho đến khi bỏ chặn.
- F5 hoặc mất mạng: tab tự khôi phục đúng phòng/câu/điểm/trợ giúp trong **60 giây** (token nằm trong `sessionStorage`, mỗi tab một phiên). Quản trò hết grace thì phòng đóng.
- Sai/hết giờ: page gà nhanh **3 giây** rồi về reveal; nhạc lose tiếp tục dưới reveal và kết thúc trước câu tiếp.
- Hết 15 câu: hạng **1–5** vào màn tổng kết ăn mừng; hạng **>5** vẫn page gà + nhạc lose đầy đủ rồi mới xem BXH.
- **BXH** ở Home mở bảng xếp hạng mọi thời đại.

## Chạy production

Yêu cầu **Node.js >= 20**.

```powershell
npm ci
npm run build
npm start
```

Mở **http://localhost:3001** — Express phục vụ `dist/`, API `/api/leaderboard` và Socket.IO trên cùng origin. Không cần Vite/5173 ở production.

- `npm start` chạy server TypeScript bằng `tsx` (đã nằm trong `dependencies`, nên `npm prune --omit=dev` sau bước build vẫn khởi động được). Không prune trước `npm run build` vì build cần devDependencies.
- Nếu chưa có `dist/index.html`, server vẫn chạy API/Socket.IO nhưng không có giao diện; phải chạy `npm run build` trước.
- Asset thiếu trả **404**, không trả nhầm HTML của SPA — tránh lỗi MIME khi deploy phiên bản mới.
- Kết quả final ghi atomic vào `data/results.json` (mặc định); thư mục này phải ghi được. Phòng đang chạy nằm trong RAM và mất khi restart, còn BXH all-time thì không.
- Health check: `GET /healthz`; BXH: `GET /api/leaderboard?limit=20`.
- Kiểm tra bản production sau khi start: `npm run test:prod` (mặc định gọi `http://localhost:3001`).

Biến môi trường production:

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `PORT` | `3001` | Cổng HTTP/Socket.IO |
| `HOST` | `0.0.0.0` | Bind mọi interface để điện thoại cùng LAN vào được |
| `RESULTS_FILE` | `data/results.json` | File lưu kết quả, tính theo thư mục chạy |
| `QUESTION_COUNT` | `15` | Chỉ dùng cho test/demo |
| `QUESTION_MS` | `15000` | Chỉ dùng cho test/demo |
| `REVEAL_MS` | `6000` | Chỉ dùng cho test/demo |
| `LOSE_MS` | `6500` | Chỉ dùng cho test/demo |
| `DISCONNECT_GRACE_MS` | `60000` | Thời gian giữ ghế khi F5/mất mạng |

Điện thoại cùng Wi-Fi mở `http://<IP-máy-chạy-server>:3001` và mở firewall cho cổng 3001. Nếu đặt sau reverse proxy, phải bật upgrade WebSocket cho `/socket.io/`.

## Test

```powershell
npm run lint          # typecheck client + server
npm run build         # typecheck + Vite build

npm run test:rooms    # phòng, 40 người chơi + quản trò, cap 40, mã
npm run test:scoring  # 15 nấc điểm + mọi tie-break xếp hạng (không cần server)
npm run test:lifelines # 50:50, gọi điện luôn sai, khán giả, MC
npm run test:server   # health + handshake + scoring
npm run test:prod     # production: static/hashed assets, SPA, 404, API, audio, socket + room flow
npm run test:results  # ghi JSON, best-per-name, đọc lại file
npm run test:game     # 15 câu, cần server fast mode bên dưới
npm run test:flow     # scoring/reveal/4 trợ giúp/final/rematch + API all-time
npm run test:load     # 1 quản trò + 40 người chơi, p95 broadcast <300ms, chặn người thứ 41
npm run test:admin    # kick/rejoin, block theo tên/clientId, unblock, quyền quản trò
npm run test:resume   # resume admin/player, grace, đóng phòng khi quản trò rời/hết grace
```

Các test tích hợp dùng đúng cổng 3001/5173, không mở port mới:

```powershell
# Terminal 1 - flow/load nhanh (3 câu)
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run dev:full

# Terminal 2
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run test:flow
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run test:load
```

Test `test:game` kiểm tra đủ 15 câu nên phải chạy server riêng với `QUESTION_COUNT=15` (nhanh):

```powershell
$env:QUESTION_COUNT='15'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run dev:full
$env:QUESTION_COUNT='15'; $env:QUESTION_MS='300'; $env:REVEAL_MS='300'; $env:LOSE_MS='300'; npm run test:game
```

`test:load` mặc định chạy 3 câu; muốn load đủ 15 câu thì dùng cùng env `QUESTION_COUNT=15` cho cả server và test. Test đo p95 broadcast từ `serverNow` đến lúc client nhận, đồng thời kiểm tra dashboard quản trò 40 người và người chơi thứ 41 bị `ROOM_FULL`.

`test:admin` cần `QUESTION_COUNT=3`, `QUESTION_MS=1500`, `REVEAL_MS=300`, `LOSE_MS=300`. `test:resume` cần server:
```powershell
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='3000'; $env:REVEAL_MS='800'; $env:LOSE_MS='400'; $env:DISCONNECT_GRACE_MS='8000'; npm run dev:full
$env:QUESTION_COUNT='3'; $env:QUESTION_MS='3000'; $env:REVEAL_MS='800'; $env:LOSE_MS='400'; $env:DISCONNECT_GRACE_MS='8000'; npm run test:resume
```

Sau test, chạy lại `npm run dev:full` không env để về 15 câu/15 giây/6 giây reveal/page gà nhanh 3 giây/page gà final 6,5 giây. File test ghi vào `data/results.json`; xoá file này nếu muốn bảng all-time sạch.

Kết quả test trình duyệt đầy đủ **1 quản trò + 6 người chơi, 15 câu, 4 trợ giúp, BXH cuối**: [`docs/MULTIPLAYER-TEST-15Q.md`](./docs/MULTIPLAYER-TEST-15Q.md).

## Cấu trúc

- `src/pages/Home.tsx` — landing, CTA đấu trường + BXH.
- `src/pages/Leaderboard.tsx` — BXH all-time từ `/api/leaderboard`.
- `src/pages/multi/Multiplayer.tsx` — entry, nhánh quản trò, lobby/game/reveal/final và route page gà.
- `src/components/multi/AdminRoom.tsx` — dashboard quản trò: mã/link, BXH trực tiếp, kick/block/unblock.
- `src/components/multi/ChickenLossPage.tsx` — page gà full-screen: nhanh 3 giây khi sai giữa câu, full + nhạc lose khi final ngoài top 5.
- `src/multiplayer/useRoom.ts` — toàn bộ state realtime + F5/reconnect resume.
- `server/` — Express + Socket.IO, room manager, game loop, lifelines, `results.ts` lưu JSON bền.
- `src/data/questions.json` — chỉ server import; không nằm trong bundle client.
- `data/results.json` — runtime data (đã gitignore), tạo tự động sau ván đầu.

Đặc tả chi tiết: [`docs/MULTIPLAYER-SPEC.md`](docs/MULTIPLAYER-SPEC.md) · UI: [`docs/MULTIPLAYER-UI.md`](docs/MULTIPLAYER-UI.md).

## Giới hạn

- Chưa có tài khoản; all-time định danh theo **tên hiển thị**, mỗi tên giữ kết quả cao nhất.
- F5 resume trong **cùng tab** (sessionStorage). Đóng tab hẳn thì chỗ ngồi được giữ tối đa 60 giây rồi giải phóng.
- Kết quả lưu file JSON, chưa có DB/Redis; phù hợp một server instance.
- Không có spectator/chat. Kick mời ra, chỉ vào lại được khi phòng về lobby; block theo tên/clientId chỉ trong phòng hiện tại, không phải xác thực tài khoản. Quản trò có thể chơi lại sau final.
