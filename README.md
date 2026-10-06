# Maison MIPA Lead Hub

> **Hệ Thống Giám Sát Nhóm Facebook, Nhận Dạng Nhu Cầu Chụp Ảnh & CRM Chuyển Đổi Tập Trung**  
> Dành riêng cho thương hiệu nhiếp ảnh nghệ thuật **Maison MIPA**.

---

## 1. Tổng Quan Kiến Trúc (Architecture Overview)

Hệ thống được xây dựng theo kiến trúc phân tán đảm bảo độ tin cậy cao, tuân thủ nguyên tắc **Single Source of Truth** dựa trên PostgreSQL, hoàn toàn độc lập giữa giao diện người dùng và tiến trình cào dữ liệu:

1. **Web App (Next.js 14 App Router + TypeScript + Tailwind CSS)**:
   - Giao diện quản trị đa vai trò: **Chủ tiệm (Admin)**, **Marketing**, **CSKH**.
   - Hỗ trợ đầy đủ các module: Giám sát hàng chờ bài viết (`/feed`), Quản lý nhóm (`/groups`), Cấu hình dịch vụ & mẫu (`/services-templates`), Pipeline CSKH (`/crm`), Cài đặt hệ thống (`/settings`).
   - Phòng vệ chống tấn công CSV Injection (Formula Injection Guard), hỗ trợ xuất file Excel tiếng Việt chuẩn UTF-8 BOM.
   - Cơ chế kiểm soát đồng thời lạc quan (Optimistic Concurrency Control - OCC) ngăn chặn hoàn toàn việc nhân viên ghi đè dữ liệu của nhau (HTTP 409 Conflict).
2. **Bộ Chạy Nền Trung Tâm (Central Worker Engine - Node.js + Playwright 1.50.0)**:
   - Tiến trình Worker chạy ngầm độc lập với bộ lập lịch không chồng chéo (Non-overlapping sequential async scheduler).
   - Cơ chế nhận job cạnh tranh bằng giao dịch SQL `FOR UPDATE SKIP LOCKED`, loại bỏ tuyệt đối nguy cơ 2 worker nhận trùng job hoặc bình luận trùng khách hàng.
   - Chống tấn công SSRF đa tầng (Anti-SSRF Validator) bảo vệ mạng nội bộ trước các URL độc hại.
3. **Cơ Sở Dữ Liệu PostgreSQL (PostgreSQL 15+ Single Source of Truth)**:
   - Quản trị toàn bộ dữ liệu qua 17 bảng quan hệ chuẩn hóa ([schema.sql](schema.sql) và [migrations/001_initial_schema.sql](src/lib/db/migrations/001_initial_schema.sql)).
   - Hệ thống tự động kích hoạt chế độ bộ nhớ trong kiểm thử (`pg-mem`) và PostgreSQL thực tế khi triển khai production (`DATABASE_URL`).
   - Ràng buộc cứng `unique_first_touch_outreach UNIQUE(post_id)` đảm bảo toàn tiệm chỉ có đúng **1 lượt tiếp cận đầu tiên**.
4. **Bảo Mật Phiên Facebook & Đăng Xuất An Toàn**:
   - Khóa phiên Facebook bằng thuật toán mã hóa đối xứng **AES-256-GCM** với khóa bí mật 256-bit (`FACEBOOK_SESSION_ENCRYPTION_KEY`). Plaintext chỉ tồn tại tạm thời trong bộ nhớ và tự động giải phóng ngay sau khi khởi tạo context trình duyệt.
   - Xác thực Cookie HMAC-SHA256 có danh sách đen thu hồi phiên bền vững (`revoked_tokens.json` & database). Đăng xuất vô hiệu hóa token ngay lập tức trên mọi tiến trình.

---

## 2. Hướng Dẫn Vận Hành & Khởi Động (Quick Start)

### 2.1. Triển Khai Trên Ubuntu / Linux (Khuyến Nghị)

Hệ thống cung cấp sẵn bộ script tự động hóa toàn diện:

```bash
# 1. Cài đặt môi trường, cấu hình file .env, cài Playwright browser và dependencies
./setup.sh

# 2. Khởi chạy toàn bộ hệ thống (Web App + Worker chạy nền)
./start.sh

# 3. Dừng hệ thống khi bảo trì
./stop.sh
```

### 2.2. Triển Khai Trên Windows (PowerShell)

Hệ thống hỗ trợ script PowerShell với phân quyền kiểm soát an toàn:

```powershell
# 1. Cài đặt hệ thống
.\setup.ps1

# 2. Khởi động Web App và Worker
.\start.ps1

# 3. Dừng dịch vụ
.\stop.ps1
```

### 2.3. Triển Khai Bằng Docker Compose

```bash
# Khởi động Web App, Worker Playwright và PostgreSQL container
docker compose up -d --build

# Xem log hoạt động của Worker
docker compose logs -f mipa-worker

# Dừng container
docker compose down
```

---

## 3. Quản Trị Dữ Liệu: Sao Lưu & Khôi Phục (Backup & Restore)

Hệ thống tích hợp sẵn công cụ xuất và khôi phục dữ liệu toàn vẹn 17 bảng PostgreSQL dưới định dạng JSON nén an toàn:

```bash
# Tạo bản sao lưu cơ sở dữ liệu (lưu tại data/backups/mipa_backup_*.json)
npm run db:backup

# Khôi phục cơ sở dữ liệu từ file sao lưu gần nhất
npm run db:restore

# Khôi phục từ file chỉ định cụ thể
npx tsx scripts/restore-db.ts data/backups/mipa_backup_2026-10-06.json
```

---

## 4. Kiểm Thử Hệ Thống (Master Test Suite)

Toàn bộ 12 tiêu chuẩn kỹ thuật được xác minh thông qua bộ kiểm thử tự động 100%:

```bash
# Chạy toàn bộ 6 bộ kiểm thử tích hợp (Test Matrix)
npm run test:all
```

Danh mục các suite kiểm thử:
1. **Phase A:** Database Connection, Repositories, Transaction Isolation & OCC Versioning.
2. **Phase B:** Structured Page Identity Parser, Relative Time Validation & Dispatch State Machine.
3. **Phase C:** Multi-Worker Job Claiming (`SKIP LOCKED`), Anti-SSRF URL Guard & AES-256-GCM Session Encryption.
4. **Phase D:** Vietnamese Tone Normalization, Budget Extractor, CSV Formula Injection & CRM Export.
5. **Phase E:** Multi-Worker Soak & Concurrency Test (0 duplicate jobs, 0 duplicate dispatches).
6. **Comprehensive Regression Matrix:** 50/50 test cases bảo vệ bảo mật, restart an toàn và khóa đồng thời.

---

## 5. Kết Nối Tài Khoản & Page Facebook

1. Tạo file cấu hình môi trường `.env.local` từ mẫu:
   ```bash
   cp .env.example .env.local
   ```
2. Cấu hình các biến bắt buộc:
   ```ini
   APP_SECRET="chuoi-khoa-bao-mat-ung-dung-ngau-nhien-32-ky-tu"
   MIPA_ADMIN_PASSWORD="mat-khau-quan-tri-vien-manh"
   INTERNAL_WORKER_KEY="chuoi-khoa-worker-noi-bo"
   FACEBOOK_SESSION_ENCRYPTION_KEY="khoa-hex-64-ky-tu-aes-256-gcm"
   FACEBOOK_PAGE_ID="100083281234567"
   FACEBOOK_PAGE_NAME="Maison MIPA"
   ```
3. Lưu cookie đăng nhập Facebook an toàn:
   ```bash
   npx playwright codegen --save-storage=data/auth/facebook_storage_state.json https://facebook.com
   ```
   Sau khi hoàn tất đăng nhập, hệ thống sẽ tự động mã hóa AES-256-GCM và bảo vệ phiên.

---

## 6. Phân Quyền Người Dùng (RBAC)

- **Admin (Chủ tiệm):** Toàn quyền cấu hình bảng giá dịch vụ, phê duyệt mẫu bình luận, cài đặt chu kỳ quét và quản trị tài khoản.
- **Marketing:** Quản lý nhóm theo dõi, xem feed bài viết, phân tích hiệu quả chiến dịch.
- **CSKH:** Tiếp nhận khách hàng từ pipeline CRM, cập nhật tiến độ tư vấn/báo giá, xuất báo cáo danh sách lead ra file CSV.

---
© 2026 Maison MIPA Photography. All rights reserved.
