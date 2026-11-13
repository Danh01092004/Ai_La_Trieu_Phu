# Kết quả test 15 câu — 1 quản trò + 6 người chơi

- **Ngày:** 13/11/2026
- **Phòng:** `ZS4WGT`
- **Cấu hình:** 15 câu, 15 giây/câu, công bố 6 giây, thưởng câu nhân đôi, tối đa `32.767` gói khi không mang thêm; tối đa lý thuyết `245.760` gói nếu luôn mang 100% và đúng hết.
- **Môi trường:** Vite `http://localhost:5173`, server Socket.IO `http://localhost:3001`.
- **Cách chạy:** 1 tab quản trò + 6 tab người chơi trong trình duyệt; người chơi trả lời tự động đúng/sai theo kịch bản để kiểm tra toàn bộ ván.

## Kết quả chung cuộc

| Hạng | Người chơi | Gói hàng | Số câu đúng |
|---:|---|---:|---:|
| 1 | Player 4 | 32.767 | 15/15 |
| 2 | Player 5 | 32.767 | 15/15 |
| 3 | Player 2 | 32.767 | 15/15 |
| 4 | Player 3 | 32.767 | 15/15 |
| 5 | Player 1 | 32.767 | 15/15 |
| 6 | Player 6 | 32.751 | 14/15 |

- Quản trò thấy đủ 6 người, `CÂU 15/15`, `VÁN ĐẤU HOÀN TẤT`, vô địch **Player 4 · 32.767 gói**.
- Player 6 (hạng 6) nhận trang gà **“CHƯA VÀO TOP 5!”**, hiển thị `HẠNG 6/6`, `32.751 gói`, phát hết nhạc lose rồi mới hiện bảng xếp hạng chung cuộc.
- Player 1 vẫn đạt 15/15 dù đã dùng cả 4 trợ giúp; mức tối đa không mang thêm đúng bằng `2^15 - 1 = 32.767`.

## Trợ giúp đã kiểm tra trên Player 1

| Trợ giúp | Kết quả quan sát |
|---|---|
| `50:50` | Overlay “Đã loại 2 đáp án sai: A và D”; hai đáp án còn lại hiển thị bình thường. |
| `Gọi điện` | Overlay hiện lời gợi ý của người thân; đáp án đúng vẫn chọn được. |
| `Khán giả` | Overlay hiện tỉ lệ `A 7% · B 10% · C 66% · D 17%`; cảnh báo khán giả có thể sai. |
| `Hỏi MC` | Overlay hiện gợi ý của MC; đáp án đúng vẫn chọn được. |

Sau khi dùng, cả 4 nút đều có dấu `✕` và không dùng lại được trong ván.

## Ảnh bằng chứng

- [Bảng xếp hạng cuối trên màn quản trò (local)](./screenshots/15q-final-admin.png)
- [Trang gà + BXH cuối trên màn người chơi hạng 6 (local)](./screenshots/15q-final-loser.png)
- [BXH cuối trên Vercel — quản trò](./screenshots/vercel-final-admin.png)
- [BXH cuối trên Vercel — người chơi hạng 6](./screenshots/vercel-final-player6.png)
- [BXH cuối trên production Vercel — quản trò (test nhanh)](./screenshots/prod-fast-final-admin.png)
- [BXH cuối trên production Vercel — người chơi (test nhanh)](./screenshots/prod-fast-final-player6.png)
- [BXH cuối trên production Vercel — quản trò (timing bình thường)](./screenshots/prod-normal-final-admin.png)
- [BXH cuối trên production Vercel — người chơi (timing bình thường)](./screenshots/prod-normal-final-player6.png)

## Test thêm trên Vercel (WebSocket thật)

- **Ngày:** 13/11/2026
- **Môi trường:** temporary deployment `https://fast-maple-n55n8ow.tmp.now`, function `api/socket-io/[...path].ts`, 6 tab người chơi + 1 tab quản trò.
- **Phòng:** `B5WCB4`; đủ 6/6 người, chạy hết 15 câu và hiện bảng chung cuộc.
- **Kết quả:** Player 1 hạng 1 `2.307` điểm (4/15), Player 2–6 `2.305` điểm; Player 1 đã dùng cả 4 trợ giúp.
- **Lưu ý:** lần test này trình duyệt tự động chọn đáp án A để chạy nhanh qua 15 câu, nên điểm thấp; mục tiêu là kiểm tra transport WebSocket, lobby 6 người, trợ giúp và final trên Vercel, không phải kiểm tra điểm tối đa.
- Adapter Vercel rút reveal còn **2,5 giây** khi `VERCEL=1`; test chạy hết 15 câu trên temporary deployment. Project Vercel hiện từ chối `maxDuration` >60 giây, nên `vercel.json` không đặt giới hạn này và độ bền ván dài vẫn phụ thuộc plan/instance.

## Production Vercel

- **URL:** `https://ai-la-trieu-phu-messi-bucu.vercel.app`
- **Build:** thành công sau khi sửa `.vercelignore` (mẫu `data/` trước đây loại luôn `src/data/questions.json`, làm `tsc` fail); commit `e81631e`.
- **Deployment protection:** đã tắt SSO để URL public; `/api/socket-io/ping` trả `200` và `altp-vercel`.
- **Test nhanh 6 người + 1 quản trò:** phòng `F4PT5C`, chạy đủ **15/15 câu**, hiện `VÁN ĐẤU HOÀN TẤT` + `CHUNG CUỘC`; cả 6 người `16.384` điểm, 1/15 câu đúng; Player 1 vô địch. Đây là test transport/final với `QUESTION_MS=300`, `REVEAL_MS=300`, `LOSE_MS=300` tạm thời, **đã xóa env và deploy lại**; không phải điểm tối đa.
- **Test bình thường 6 người + 1 quản trò:** phòng `QPW7BX`, chạy đủ **15/15 câu** với timing 15 giây/câu + reveal 2,5 giây; final `VÁN ĐẤU HOÀN TẤT`, vô địch **Normal P1 · 16.448 điểm** (2/15). Một tab người chơi (Normal P4) mất kết nối do trình duyệt automation chạy nền, vẫn được xếp hạng 6 với 64 điểm; 5 tab còn lại hoàn tất.
- **Timing production bình thường:** đo được reveal câu 1 sau **15,5 giây** sau khi xóa env nhanh, đúng cấu hình 15 giây/câu.
- **Trợ giúp:** Player 1 đã dùng `50:50` trong test production bình thường; cả 4 trợ giúp đã được kiểm tra đầy đủ ở test local `ZS4WGT` và temporary `B5WCB4`.
- **Giới hạn Vercel:** phòng/matches lưu trong RAM của một function instance. 6 tab cùng một trình duyệt đã chạy được, nhưng client ở instance khác có thể không thấy phòng; đây là lý do production phù hợp demo/test, chưa phù hợp lưu lượng thật nếu không có Redis/pub-sub hoặc server realtime riêng.

## Kiểm tra lại sau tối ưu hiệu năng UI

- **Ngày:** 13/11/2026
- **Môi trường:** Vite `http://localhost:5173`, server Socket.IO `http://localhost:3001`, timing test nhanh `QUESTION_MS=1000`, `REVEAL_MS=600`, `LOSE_MS=600`.
- **Phòng:** `RPXVCB` — 1 quản trò + 6 người chơi.
- **Kết quả:** chạy đủ **15/15 câu**, hiện `TỔNG KẾT · 15 CÂU`, bảng chung cuộc đủ 6 người.
  - Fast P2 vô địch `16.384` điểm (1/15).
  - Fast P1 hạng 2, Fast P3 hạng 3, Fast P6 hạng 4 (cùng `16.384`, 1/15).
  - Fast P4 hạng 5, Fast P5 hạng 6 (`0` điểm).
- **Hiệu năng:** trang chủ từ ~34–42 FPS (production cũ, CPU throttle 4×) lên **~60 FPS** ở bản mới; local dev và mobile cũng ~60 FPS. Chi tiết nguyên nhân và số đo ở [PERFORMANCE-AUDIT.md](./PERFORMANCE-AUDIT.md).
- Đây là test chức năng nhanh, không phải kiểm tra điểm tối đa; logic chấm điểm/trợ giúp không thay đổi.

## Mang thêm gói hàng

- **Công thức:** `W = floor(score × percent / 100)`, `percent ∈ {10, 25, 100}`; server tự tính, client không gửi số gói.
- **Khóa:** `wagerLockAt = endsAt - 3000`; trước mốc này đổi được nhiều lần, sau mốc server trả `WAGER_LOCKED` và UI xám toàn bộ.
- **Đúng:** `score += reward + W`; **sai/hết giờ:** không nhận `reward`, `score -= W` (không xuống dưới 0).
- **Kiểm tra tự động:** `npm run test:scoring` kiểm tra công thức/rounding; `npm run test:wager` chạy 2 câu thật qua Socket.IO, kiểm tra `WAGER_NOT_AVAILABLE`, `INVALID_WAGER`, `WRONG_QUESTION`, `WAGER_LOCKED`, cộng thưởng, trừ phạt và final.
- **UI:** panel nằm giữa thưởng câu và 4 trợ giúp; hiện số gói mang theo, đếm ngược tới khóa, disable mức không đủ gói; reveal hiện tách `Thưởng câu` / `Mang thêm` / tổng.
- **Lưu ý:** câu 1 chưa có gói nên cả 3 mức đều chưa dùng được; từ câu 2 trở đi mới có gói để mang.

## Ghi chú

- Bộ câu hỏi hiện có 25 câu; mỗi ván bốc ngẫu nhiên 15 câu, không lặp.
- Test này dùng thao tác trình duyệt tự động để trả lời nhanh; các lớp UI, Socket.IO, chấm điểm, reveal, xếp hạng và trang thua đều là mã sản phẩm thật.
