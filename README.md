# Maison MIPA Lead Hub

> **Hệ Thống Giám Sát Nhóm Facebook, Nhận Dạng Nhu Cầu Chụp Ảnh & CRM Chuyển Đổi Tập Trung**  
> Dành riêng cho thương hiệu nhiếp ảnh nghệ thuật **Maison MIPA**.

---

## 1. Tổng Quan Kiến Trúc (Architecture Overview)

Hệ thống được thiết kế theo mô hình phân tách độc lập nhằm đảm bảo **tính liên tục** và **an toàn tối đa**:

1. **Web App (Next.js 14 + TypeScript + Tailwind CSS)**:
   - Giao diện quản trị đa vai trò: **Chủ tiệm (Admin)**, **Marketing**, **CSKH**.
   - Chạy trên mọi trình duyệt (Windows / macOS / Ubuntu / Mobile).
   - Đóng tab web app **không làm dừng** việc quét nhóm.
2. **Bộ Chạy Nền Trung Tâm (Central Worker Engine - Node.js + Playwright + BullMQ)**:
   - Chạy nền độc lập trên máy chủ Ubuntu trung tâm (hoặc Docker Daemon).
   - Tự động duy trì nhịp tim (Heartbeat) và cập nhật tiến độ về Web App.
   - Khi máy chủ tắt hoặc mất mạng, giao diện lập tức cảnh báo trạng thái dừng.
3. **Cơ Sở Dữ Liệu & Chống Trùng Lặp (Idempotency & Deduplication)**:
   - File schema: [`schema.sql`](file:///home/rd/Desktop/tool%20sd/schema.sql) hỗ trợ Supabase PostgreSQL với Row Level Security (RLS).
   - **Ràng buộc cứng:** `post_url_hash UNIQUE` và `unique_first_touch_outreach UNIQUE(post_id)` đảm bảo toàn tiệm chỉ có đúng **1 lượt tiếp cận đầu tiên**.
4. **Phòng Vệ Prompt Injection & Lớp Nhận Dạng Hai Tầng (Two-tier Classifier)**:
   - **Tầng 1 (Rule Filter):** Loại bỏ ngay các bài rao bán máy ảnh, lens, tuyển thợ, spam quảng cáo mà không tốn token AI.
   - **Tầng 2 (LLM / Structured Extraction):** Trích xuất thực thể (Dịch vụ, Địa điểm, Số người, Thời gian, Ngân sách, Yêu cầu hỗ trợ tạo dáng).
   - **Phòng thủ Injection:** Nội dung bài đăng Facebook được cách ly và lọc sạch các từ khóa can thiệp như *"bỏ qua hướng dẫn"*, *"hãy viết rằng"*. AI bị cấm tự đặt giá hoặc tự hứa lịch hẹn.

---

## 2. Tiêu Chí Nghiệm Thu Từng Giai Đoạn (Phases A -> E)

| Giai đoạn | Nội dung | Lệnh kiểm thử / Vận hành |
|---|---|---|
| **A — Kiểm chứng Facebook** | Kiểm tra quyền truy cập nhóm, đọc DOM bài mới, kiểm tra quyền Page | `npm run test:auth`<br/>`npm run test:crawler` |
| **B — Nền tảng** | Bảng dịch vụ, mẫu bình luận, phân quyền, dữ liệu dùng chung | Truy cập Web App: [http://localhost:3000](http://localhost:3000) |
| **C — Theo dõi tự động** | Lập lịch (120s/150s/180s), chống trùng, tự phục hồi sau lỗi | `npm run worker` |
| **D — Nhận dạng & Bình luận** | Bóc tách nhu cầu, chọn mẫu theo giá, chế độ Duyệt tay vs Tự động | Tab **Hàng Chờ Bài Viết** (`/feed`) |
| **E — CSKH & Báo cáo** | Pipeline 6 bước: Chưa phản hồi ➔ Tư vấn ➔ Báo giá ➔ Đặt lịch | Tab **Pipeline CSKH** (`/crm`) |

---

## 3. Hướng Dẫn Cài Đặt & Chạy Thử Nghiệm

### 3.1. Chạy Trực Tiếp (Local Development)

```bash
# 1. Cài đặt các gói phụ thuộc (Đã hoàn tất)
npm install

# 2. Khởi chạy Web App (Cổng 3000)
npm run dev

# 3. Chạy kiểm chứng Giai đoạn A
npm run test:auth
npm run test:crawler

# 4. Khởi chạy Bộ Chạy Nền Trung Tâm (Worker)
npm run worker
```

### 3.2. Triển Khai Docker Compose (Ubuntu Server)

```bash
docker compose up -d --build
```
Hệ thống sẽ tự động khởi động:
- `mipa-redis`: Hàng đợi điều phối BullMQ.
- `mipa-web`: Ứng dụng Next.js cổng 3000.
- `mipa-worker`: Tiến trình Playwright chạy ngầm tự khởi động lại khi gặp lỗi.

---

## 4. Quản Trị Phiên Đăng Nhập Facebook & An Toàn Dữ Liệu

1. **Vị trí file phiên:** `data/auth/facebook_storage_state.json`.
2. **Cơ chế mã hóa:** Được mã hóa bằng thuật toán `AES-256-CBC` thông qua biến môi trường `FACEBOOK_SESSION_ENCRYPTION_KEY`.
3. **Cách nạp cookie phiên thật:**
   - Chạy lệnh xuất session bằng Playwright CLI:
     ```bash
     npx playwright codegen --save-storage=data/auth/facebook_storage_state.json https://facebook.com
     ```
   - Đăng nhập tài khoản điều hành và cấp quyền Page.
   - Hệ thống sẽ tự động nhận diện và bảo vệ phiên.

---

## 5. Quy Chuẩn Vận Hành Đã Kiểm Chứng

- **Hai nhân viên thao tác cùng bài:** Nhờ cơ chế distributed lock & DB constraint, người thao tác sau sẽ nhận thông báo bài đã được xử lý.
- **Mất mạng giữa chừng:** Job chuyển trạng thái sang `uncertain_failed` (Chưa xác định kết quả) và **không tự động gửi lại** để tránh spam Facebook.
- **Nút "Mô Phỏng Quét Nhóm":** Tích hợp sẵn ngay trên Dashboard cho phép thử nghiệm toàn bộ luồng từ bài viết mới ➔ trích xuất thực thể ➔ duyệt mẫu ➔ đẩy sang CRM mà không phụ thuộc vào trạng thái mạng Facebook tại thời điểm test.
