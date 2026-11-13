# Audit hiệu năng UI — vì sao game bị “lag/chậm”

- **Ngày đo:** 13/11/2026 (Asia/Saigon)
- **Triệu chứng:** UI giật/chậm khi ở trang chủ, vào phòng và lúc xem câu hỏi; không phải lỗi mạng.
- **Kết luận:** nguyên nhân chính là **hiệu ứng nền chạy liên tục**, không phải Vite/React hay Socket.IO.

## Cách đo

Dùng Chrome DevTools/Playwright, **giữ đúng 1 tab** (nhiều tab animation chạy nền làm số đo sai), throttle CPU **4×**, đo `requestAnimationFrame` trong 3 giây:

- So sánh production cũ `https://ai-la-trieu-phu-messi-bucu.vercel.app` với bản build mới ở `http://localhost:4173`.
- Đo thêm local dev `http://localhost:5173` và viewport mobile `390 × 844`.
- Kiểm tra chéo bằng Chrome Performance trace và thử tắt từng lớp hiệu ứng để khoanh vùng chi phí.

## Nguyên nhân theo mức độ

| # | Nguyên nhân | Bằng chứng |
|---:|---|---|
| 1 | Hai `.spotlight` kích thước `55vmax × 130vmax`, có `blur(10px)`, `mix-blend-mode: screen` và animation quay vô hạn | Tắt riêng spotlight: **22,36 → 17,81 ms/frame**; tắt toàn bộ animation: **16,67 ms** |
| 2 | Canvas hạt chạy 30 FPS với 90 density / tối đa 80 hạt, mỗi tick tạo `Map` + bucket để vẽ đường nối | Ẩn canvas: **~23,6 → ~19,8 ms**; sửa sang 40 hạt, một path duy nhất, bỏ cấp phát mỗi frame |
| 3 | Vòng xoay `120vmax` (`animate-spinSlow`) và viền conic `@property --angle` chạy vô hạn | Tắt viền: **17,81 → 16,67 ms**; tắt bloom: **16,82 ms** |
| 4 | Logo dùng Framer Motion lặp `y: [0, -14, 0]` mỗi frame | Đổi sang CSS `transform` trên compositor |
| 5 | Admin dashboard cập nhật mỗi **250 ms** dù chỉ hiển thị giây | Giảm còn **500 ms**, giảm một nửa số lần React commit |

## Đã thay đổi

| File | Thay đổi |
|---|---|
| `src/components/GameScene.tsx` | Bloom thành tĩnh; chỉ render spotlight ở trang chủ; giảm hạt (44/28), tắt đường nối và tương tác chuột khi đang chơi |
| `src/components/ParticleField.tsx` | Giới hạn 40 hạt, DPR ≤ 1,25, bỏ `Map`/bucket mỗi frame, gộp toàn bộ đường nối vào **một** `beginPath()`/`stroke()` |
| `src/index.css` | Bỏ blur + blend + animation của spotlight; viền conic thành tĩnh, bỏ `@property`; logo float bằng CSS compositor |
| `src/pages/Home.tsx` | Bỏ vòng lặp Framer Motion của logo; bỏ lớp `blur-xl` trên nút chơi |
| `src/components/multi/AdminRoom.tsx` | Timer 250 ms → 500 ms |

## Kết quả đo

| Màn hình / môi trường | Trước | Sau |
|---|---:|---:|
| Production cũ — trang chủ, CPU 4× | **23,75–29,05 ms/frame** (~34–42 FPS) | — |
| Bản mới — preview production, CPU 4× | — | **16,67–16,76 ms/frame** (~60 FPS) |
| Bản mới — local dev, CPU 4× | — | **16,67 ms/frame** (~60 FPS) |
| Bản mới — mobile 390 × 844, CPU 4× | — | **16,95 ms/frame** (~59 FPS) |
| Bản mới — màn kết thúc (3 canvas gồm confetti/fireworks), CPU 4× | — | **17,24 ms/frame** (~58 FPS) |

- Ở CPU 1× (máy bình thường), sau khi sửa, trang chủ và màn chơi đều giữ **60 FPS**.
- Số đo lần đầu sau khi load có thể có outlier do compile/GC; bảng trên lấy các lần đo ổn định sau đó.
- Đây là đo trên Chromium desktop với CPU throttle; máy GPU yếu hơn vẫn có thể cần bật “giảm chuyển động” của hệ điều hành (CSS đã tôn trọng `prefers-reduced-motion`).

## Kiểm tra lại chức năng

- `npm run lint` và `npm run build` đều pass.
- Test local nhanh **1 quản trò + 6 người chơi**, phòng `RPXVCB`:
  - Đủ **15/15 câu**, hiện `TỔNG KẾT · 15 CÂU` và bảng chung cuộc.
  - 6 người vào phòng, quản trò không chơi, không thấy nội dung câu hỏi.
  - Kết quả: Fast P2 vô địch `16.384` điểm (1/15); Fast P1 hạng 2, Fast P3 hạng 3, Fast P6 hạng 4, Fast P4 hạng 5, Fast P5 hạng 6.
  - Đây là test chức năng với `QUESTION_MS=1000`, `REVEAL_MS=600`, `LOSE_MS=600`; timing sản phẩm vẫn là 15 giây/câu + reveal 6 giây local / 2,5 giây trên Vercel.
- Không thay đổi protocol, chấm điểm, trợ giúp hay logic server; 4 trợ giúp đã được kiểm tra đầy đủ trước đó và không bị ảnh hưởng bởi các thay đổi UI này.

## Ghi chú còn lại

- Trên Vercel, phòng vẫn nằm trong RAM của một function instance; đây là giới hạn hạ tầng đã biết, không liên quan đến lag UI.
- Canvas hạt vẫn cố ý chạy 30 FPS; nếu muốn tiết kiệm pin hơn nữa có thể thêm tùy chọn “giảm hiệu ứng” trong Settings.
