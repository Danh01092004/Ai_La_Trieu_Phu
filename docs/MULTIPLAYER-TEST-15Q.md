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

- [Bảng xếp hạng cuối trên màn quản trò](./screenshots/15q-final-admin.png)
- [Trang gà + BXH cuối trên màn người chơi hạng 6](./screenshots/15q-final-loser.png)

## Ghi chú

- Bộ câu hỏi có 20 câu nhưng mỗi ván chỉ bốc 15 câu, không lặp.
- Test này dùng thao tác trình duyệt tự động để trả lời nhanh; các lớp UI, Socket.IO, chấm điểm, reveal, xếp hạng và trang thua đều là mã sản phẩm thật.
