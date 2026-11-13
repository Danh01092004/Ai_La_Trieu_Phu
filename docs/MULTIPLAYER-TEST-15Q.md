# Kết quả test 15 câu — 1 quản trò + 6 người chơi

- **Ngày:** 13/11/2026
- **Phòng:** `ZS4WGT`
- **Cấu hình:** 15 câu, 15 giây/câu, công bố 6 giây, điểm nhân đôi, tối đa `32.767`.
- **Môi trường:** Vite `http://localhost:5173`, server Socket.IO `http://localhost:3001`.
- **Cách chạy:** 1 tab quản trò + 6 tab người chơi trong trình duyệt; người chơi trả lời tự động đúng/sai theo kịch bản để kiểm tra toàn bộ ván.

## Kết quả chung cuộc

| Hạng | Người chơi | Điểm | Số câu đúng |
|---:|---|---:|---:|
| 1 | Player 4 | 32.767 | 15/15 |
| 2 | Player 5 | 32.767 | 15/15 |
| 3 | Player 2 | 32.767 | 15/15 |
| 4 | Player 3 | 32.767 | 15/15 |
| 5 | Player 1 | 32.767 | 15/15 |
| 6 | Player 6 | 32.751 | 14/15 |

- Quản trò thấy đủ 6 người, `CÂU 15/15`, `VÁN ĐẤU HOÀN TẤT`, vô địch **Player 4 · 32.767 điểm**.
- Player 6 (hạng 6) nhận trang gà **“CHƯA VÀO TOP 5!”**, hiển thị `HẠNG 6/6`, `32.751 điểm`, phát hết nhạc lose rồi mới hiện bảng xếp hạng chung cuộc.
- Player 1 vẫn đạt 15/15 dù đã dùng cả 4 trợ giúp; điểm tối đa đúng bằng `2^15 - 1 = 32.767`.

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

## Test thêm trên Vercel (WebSocket thật)

- **Ngày:** 13/11/2026
- **Môi trường:** temporary deployment `https://fast-maple-n55n8ow.tmp.now`, function `api/socket-io/[...path].ts`, 6 tab người chơi + 1 tab quản trò.
- **Phòng:** `B5WCB4`; đủ 6/6 người, chạy hết 15 câu và hiện bảng chung cuộc.
- **Kết quả:** Player 1 hạng 1 `2.307` điểm (4/15), Player 2–6 `2.305` điểm; Player 1 đã dùng cả 4 trợ giúp.
- **Lưu ý:** lần test này trình duyệt tự động chọn đáp án A để chạy nhanh qua 15 câu, nên điểm thấp; mục tiêu là kiểm tra transport WebSocket, lobby 6 người, trợ giúp và final trên Vercel, không phải kiểm tra điểm tối đa.
- Adapter Vercel rút reveal còn **2,5 giây** khi `VERCEL=1`; test chạy hết 15 câu trên temporary deployment. Project Vercel hiện từ chối `maxDuration` >60 giây, nên `vercel.json` không đặt giới hạn này và độ bền ván dài vẫn phụ thuộc plan/instance.

## Ghi chú

- Bộ câu hỏi có 20 câu nhưng mỗi ván chỉ bốc 15 câu, không lặp.
- Test này dùng thao tác trình duyệt tự động để trả lời nhanh; các lớp UI, Socket.IO, chấm điểm, reveal, xếp hạng và trang thua đều là mã sản phẩm thật.
