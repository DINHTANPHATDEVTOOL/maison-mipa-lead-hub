# ĐỐI CHIẾU 12 TASK — MAISON MIPA LEAD HUB

Ngày kiểm tra: 06/10/2026. Nhánh: `feat/complete-lead-hub`. Commit: `1083bd7196f0ec97c6268dce48b2fb0bac037124`.

Repository: https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/tree/1083bd7196f0ec97c6268dce48b2fb0bac037124

## Kết luận

Chưa đủ điều kiện nghiệm thu hoàn thành 12/12 task. Repo có tiến bộ về repositories, schema, parser danh tính, NLP, CSV và script vận hành. Tuy nhiên, dữ liệu PostgreSQL chưa nối thống nhất với luồng quét/gửi; migration, insert, lịch quét lặp và đường gửi tự động còn lỗi chặn vận hành. Các lỗi này tồn tại dù những assertion hiện có đạt.

Không suy ra tỷ lệ phần trăm hoàn thành từ số file hoặc số assertion. Các trạng thái bên dưới đối chiếu với tiêu chí nghiệm thu, không phủ nhận những phần đã triển khai.

## Phạm vi kiểm tra và kết quả

| Kiểm tra | Kết quả quan sát |
|---|---|
| Đọc báo cáo Pasted text(3).txt và source nhánh feature | Đã thực hiện, đúng HEAD 1083bd7 |
| Phase A | 21 assertions đạt trong cấu hình pg-mem |
| Phase B | 15 assertions đạt |
| Phase C | 21 assertions đạt |
| Phase D | 32 assertions đạt |
| Soak hiện có | Chạy mặc định 5 giây; hai vòng async cùng tiến trình; log 3 + 3 lượt claim cho 5 jobs; counter trùng vẫn 0 |
| Regression cũ, chạy riêng | 50/50 assertions đạt |
| Production build với env kiểm thử được cung cấp | Đạt, exit 0 |
| Build sạch không đưa secret phiên vào build | Không đạt, exit 1; lỗi FACEBOOK_SESSION_ENCRYPTION_KEY lúc collect page data |
| SQL/repository diagnostic bổ sung | Dùng PostgreSQL engine nhúng PGlite với adapter Pool phục vụ test; tái hiện các lỗi bên dưới |
| PostgreSQL server/Docker thật, Windows thật, Facebook thật | Chưa chạy trong lượt kiểm tra này |

Các test TypeScript được chạy qua Node loader và shim thay cách gọi CLI con vì `tsx` CLI gặp hạn chế IPC trong môi trường kiểm tra. Shim không thay assertion nghiệp vụ. Không khẳng định master runner đã in đủ tổng kết 6/6 từ log thu được; từng nhóm A–D, soak và regression có kết quả riêng như bảng trên.

PGlite dùng engine PostgreSQL nhúng, không phải pg-mem và không thay thế kiểm thử nhiều connection/tiến trình trên PostgreSQL server thật. Các test SQL bổ sung kiểm tra migration, constraint, schema và trạng thái; không dùng để chứng minh distributed locking.

## Các lỗi cần sửa trước khi nghiệm thu

### R01 — P1: Migration trên database rỗng bị bỏ qua CREATE TABLE

Nguồn: `src/lib/db/migrate.ts:59–66`.

Runner tách SQL bằng dấu chấm phẩy rồi bỏ toàn bộ statement có đầu là `--`. Trong migration, mỗi CREATE TABLE có comment đứng trước, nên statement tạo bảng bị bỏ trong khi CREATE INDEX tiếp theo vẫn được chạy.

Tái hiện bằng chính `runMigrations()` trên engine PostgreSQL rỗng: `42P01: relation "facebook_groups" does not exist`. Sau rollback, `to_regclass('public.facebook_groups')` trả null. Nhánh pg-mem tự tạo toàn schema và tự ghi version đã áp dụng nên test hiện tại không kiểm chứng đường migration này.

Yêu cầu sửa: thực thi nguyên SQL file trong transaction hoặc dùng runner/parser migration đúng; không loại statement SQL chỉ vì có comment trước. Test cài mới, chạy migration lần hai, rollback và nâng cấp database cũ.

### R02 — P1: Repository bỏ ID trong INSERT, schema không có default ID

Nguồn: `src/lib/repositories/group.repository.ts:64–89`, `post.repository.ts:179–211`; migration dòng 14 và 92.

Khi caller không cung cấp ID, repository bỏ cột id khỏi INSERT. Schema dùng `VARCHAR(64) PRIMARY KEY` không có DEFAULT. API thêm nhóm và worker tạo bài đều không truyền ID.

Tái hiện: groupRepo.create không ID và postRepo.createIfNew không ID đều trả `23502: null value in column "id" ... violates not-null constraint` trên PostgreSQL engine.

Yêu cầu sửa: thống nhất sinh ID tại repository hoặc database; rà soát tất cả hàm create của groups/posts/services/templates/leads. Test đúng request UI và input crawler thường dùng, không chỉ fixture đã có ID.

### R03 — P1: Confidence không vừa kiểu dữ liệu, gây ghi dở dang

Nguồn: migration `confidence_score NUMERIC(5,4)` dòng 120; `post.repository.ts:223–248`.

Classifier dùng điểm theo thang 0–100; NUMERIC(5,4) chỉ dành một chữ số trước dấu thập phân. Tạo bài với ID hợp lệ vẫn thất bại khi lưu classification: `22003: numeric field overflow`.

Quan sát sau lỗi: đã có 1 facebook_posts nhưng 0 lead_classifications. Insert bài và classification chưa nằm trong một transaction; lần quét lại thấy bài tồn tại rồi trả isNew=false, không tự sửa phần classification bị thiếu.

Yêu cầu sửa: thống nhất thang confidence trong schema/API/UI/worker, thêm CHECK phù hợp; lưu dữ liệu liên quan nguyên tử hoặc có bước recovery rõ ràng. Test lỗi giữa insert bài và phân loại, cùng retry sau lỗi.

### R04 — P1: Luồng production vẫn chia giữa PostgreSQL và JSON

Nguồn: `src/app/api/groups/[id]/check/route.ts:21`; `src/app/api/posts/[id]/comment/route.ts:99`; `src/lib/store.ts`.

Danh sách nhóm/bài đọc từ DB mới, nhưng “Quét ngay” tìm nhóm trong store JSON và bình luận tự động qua API vẫn gọi store.dispatchComment của JSON.

Tái hiện với NODE_ENV=production: nhóm tồn tại trong DB → POST check trả 404 “Không tìm thấy nhóm”; bài tồn tại trong DB → POST comment trả 400 “Không tìm thấy bài viết”. Trong môi trường dev, bản ghi mirror còn được tạo với ID khác, nên mirror không bảo đảm nối được hai luồng.

Yêu cầu sửa: mọi route và worker dùng chung repository/service PostgreSQL; quét ngay đi qua queue; gửi duyệt tay và gửi tự động đi qua cùng service outreach. Loại mirror/fallback JSON khỏi đường nghiệp vụ sau migration.

### R05 — P1: Job quét hoàn thành không chạy lần tiếp theo

Nguồn: `src/worker/index.ts:32–41`; `src/lib/repositories/job.repository.ts:39–43`.

Worker luôn tạo job cùng ID `crawl_<groupId>`. Khi trùng ID, createJob chỉ đổi payload/run_at, giữ status=completed. claimNextJob chỉ lấy pending.

Tái hiện: tạo job → claim → complete → schedule cùng ID lần nữa. Trạng thái vẫn completed; lần claim tiếp theo trả null. Nhóm chỉ quét lần đầu thay vì tiếp tục 2–3 phút/lần.

Ngoài ra chưa thấy recovery job running sau crash; release chỉ xảy ra khi shutdown nhận được signal, không xử lý SIGKILL/mất máy. attempts không được reset cho lần quét định kỳ mới.

Yêu cầu sửa: thiết kế lần chạy định kỳ riêng hoặc reset trạng thái có điều kiện sau complete; không reset job đang chạy; thêm owner/lease/recovery và retry budget theo từng lần chạy. Test ít nhất ba chu kỳ và kill/restart worker.

### R06 — P1: Auto-dispatch bỏ qua chống trùng DB, Page ID và lưu kết quả

Nguồn: `src/worker/index.ts:103–119`, `146–151`.

Worker gọi commentDispatcher.dispatchComment trực tiếp, không claimFirstTouch, không truyền FACEBOOK_PAGE_ID, không lưu status/comment ID/evidence vào outreach sau gửi. Kết quả dispatcher bị bỏ qua. Job dispatch_outreach được claim nhưng rơi vào else và đánh dấu completed mà không gửi.

Hệ quả: một bài worker đã gửi vẫn chưa có trạng thái tiếp cận tương ứng trong DB để UI chặn thao tác khác; cấu hình Page ID không được cưỡng chế trong đường gửi worker. Chưa có khóa Page dùng chung cho các nhóm/job/request khác nhau.

Yêu cầu sửa: một service điều phối outreach dùng cho mọi entry point; claim DB nguyên tử trước submit, khóa theo Page, ghi attempted/submission evidence và finalize. Job dispatch phải xử lý thật. Crash/mất mạng sau submit chuyển chưa xác định, không gửi lại tự động. Tham chiếu Page và giới hạn/quyền nhóm từ cấu hình đã xác minh.

### R07 — P1: Danh tính xung đột vẫn bị chấp nhận

Nguồn: `src/worker/dispatcher.ts:69–76`, `453–472`, `493–500`.

Parser ưu tiên targetPageId nếu thấy nó trong chuỗi evidence. Hàm kiểm tra chỉ từ chối tập ID xung đột khi tập đó không chứa target. DOM vẫn gom các link trong form/document.

Chạy callback đọc DOM thật trên fixture: avatar và switcher là Personal Profile ID 222; link Page 111 xuất hiện trong form. Kết quả: matched=true, activePageId=111, identityType=page và conflicts=[222,111].

Yêu cầu sửa: evidence chỉ từ đúng danh tính của composer; mọi mâu thuẫn danh tính hoạt động phải bị chặn; parser không chọn ID theo mong muốn caller. Test phải gọi verifyAndSwitchPageIdentity với DOM có cả ID đúng/sai, không chỉ assert parser “có conflicts”.

### R08 — P1: Đường build/cài mới Docker và native chưa hoàn thiện

Nguồn: `Dockerfile` (RUN npm run build), `src/worker/auth.ts:12–17`, `start.sh:47–54`, `start.ps1`.

Docker Compose cấp khóa phiên ở runtime; Dockerfile builder không cấp khóa đó. Build sạch đã compile/typecheck xong rồi lỗi collect page data cho /api/groups vì singleton AuthManager yêu cầu FACEBOOK_SESSION_ENCRYPTION_KEY ngay lúc import.

Native scripts tạo/kiểm tra .env nhưng không load/export env cho tsx worker và migration. Next.js nạp .env cho web, còn các process Node riêng chưa có loader tương ứng. Với env chỉ nằm trong file, worker có thể khởi tạo pg-mem của riêng nó thay vì DB chung; mỗi process có bộ nhớ riêng, không bền vững.

Yêu cầu sửa: tránh tạo singleton cần runtime secret trong lúc build; kiểm tra cấu hình ở runtime đúng chỗ. Cài loader env nhất quán cho worker/migration/backup; production native dùng production mode, readiness và kiểm tra DB thật. Không giải quyết bằng hardcode secret hoặc nhúng secret production vào image. Chạy Docker build/cài mới và Windows thật trước khi xác nhận hỗ trợ.

### R09 — P2: Thu hồi token trong DB chưa được thực thi khi xác thực

Nguồn: `src/lib/auth.ts:94–101`, `190–200`, `217–219`; login route dòng httpOnly.

revokeToken ghi DB theo kiểu không await và nuốt lỗi; API verifyAuth/verifySignedToken chỉ kiểm tra RAM/files, không gọi isTokenRevokedAsync.

Tái hiện: ghi token vào revoked_tokens bằng authRepo → authRepo xác nhận revoked=true → verifyAuth với token đó vẫn success=true/status=200 khi không có bản thu hồi trong RAM/files của process.

Tài khoản cá nhân/password hash mới có bảng/helper, login vẫn dùng danh sách role/account cũ. Cookie login vẫn httpOnly=false; bearer còn xuất ra client. Chưa đủ điều kiện đóng Task 09.

Yêu cầu sửa: authenticate/authorize async dùng DB session/account và revocation chung; await thu hồi, truyền lỗi; hoàn thiện tài khoản nhân viên, cookie HttpOnly, RBAC worker theo quyền cần thiết và kiểm thử từ process khác.

### R10 — P2: Test, soak và backup/restore chưa đạt mức nghiệm thu đã giao

Nguồn: `tests/test-soak.ts:12,51,107,116`; `scripts/backup-db.ts`, `restore-db.ts`; không có thư mục .github/workflows trong nhánh kiểm tra.

- Soak mặc định 5 giây thay vì 2 giờ; hai loop chạy trong cùng process. duplicateClaims khởi tạo 0 và không được tăng; điều kiện pass chỉ xét duplicateClaims===0, không assert số gửi thành công đúng 1. Trong log thu được có tổng 6 claims cho 5 jobs nhưng vẫn báo không trùng.
- Các test database chủ yếu dùng pg-mem, không test migration trên DB mới và không phát hiện các lỗi constraint PostgreSQL nêu trên. Một số test Page/freshness còn mock kết quả hoặc test biểu thức tách rời.
- Chưa có CI matrix, browser E2E UI đầy đủ, Windows thật, kill/restart hai worker OS và Facebook live evidence.
- Backup đọc từng bảng không trong snapshot transaction; lỗi đọc bảng bị chuyển thành mảng rỗng rồi báo thành công. Restore bỏ qua lỗi từng row, ON CONFLICT DO NOTHING và vẫn tăng bộ đếm; chưa chứng minh khôi phục đầy đủ và nhất quán. Test backup/restore cần so sánh nội dung và quan hệ, không chỉ exit 0.

Yêu cầu sửa: bổ sung integration PostgreSQL thật, multi-process barrier, CI/OS/browser fixtures và soak có đo claim theo job ID thật. Backup thất bại phải báo lỗi, restore có validation/transaction hoặc chế độ import được mô tả chính xác; kiểm tra đầy đủ dữ liệu và trạng thái chống tiếp cận trùng sau restore.

## Đối chiếu từng task

| Task | Trạng thái nghiệm thu | Phần còn cần thực hiện |
|---|---|---|
| 01 — PostgreSQL | Chưa đạt | R01–R04; transaction và migration cài mới, thống nhất caller |
| 02 — Đúng Page | Chưa đạt | R07; evidence gắn composer, bắt buộc ID cho đường auto |
| 03 — Xác minh/chống trùng | Một phần | Có sửa recency; thiếu service/state machine chung, full-text còn includes trên container, thiếu recovery/evidence thật |
| 04 — Worker/queue | Chưa đạt | R05–R06; quét lặp, job dispatch thật, recovery, heartbeat độc lập |
| 05 — Crawler | Một phần | Có URL validator; chưa xác minh sort UI, giờ unknown vẫn fallback now, quét ngay còn JSON/không queue |
| 06 — Page/session | Một phần | Có AES-GCM; saveSession vẫn ghi plaintext; clearPlaintextSession chỉ thấy gọi ở test; thiếu luồng cấu hình/kết nối Page đầy đủ |
| 07 — Phân loại/mẫu | Một phần | NLP cải thiện; confidence SQL lỗi, chưa đủ CRUD/version approval UI/API và test xuyên luồng |
| 08 — UI/CRM | Một phần | Có CSV/OCC và UI sửa; luồng duyệt gửi bị tách kho dữ liệu, thiếu browser E2E đủ chức năng |
| 09 — Auth/audit | Một phần | R09; tài khoản riêng/HttpOnly/thu hồi DB/RBAC worker/audit chưa nối hoàn chỉnh |
| 10 — Cài đặt/vận hành | Chưa đạt | R08; Docker build sạch, load env native, startup readiness, Windows thật |
| 11 — Kiểm thử | Chưa đạt | R10; unit pass chưa đủ integration/E2E/OS/CI |
| 12 — Bàn giao/soak | Chưa đạt | Soak 2 giờ, backup/restore đủ dữ liệu, nghiệm thu toàn luồng; chưa có bằng chứng live |

## Task sửa tiếp để gửi cho AI

1. Đóng R01–R03 bằng test PostgreSQL server thật trước: fresh migrate, thêm nhóm qua HTTP, worker thêm bài không ID, lưu classification/CRM đúng schema và rollback lỗi.
2. Đóng R04 và R06: chuyển toàn bộ entry point về service/repository chung; loại JSON khỏi đường vận hành, có claim/finalize outreach và Page ID bắt buộc.
3. Đóng R05: test quét ít nhất ba lần, hai worker, kill/restart; job dispatch xử lý thật và không retry mù sau submit.
4. Đóng R07 với DOM fixture thực thi callback thật, nhiều composer và evidence xung đột; không chọn ID dựa theo target yêu cầu.
5. Đóng R08–R09: build sạch, Docker/native env, xác thực/thu hồi DB và tài khoản nhân viên.
6. Hoàn thiện các thiếu sót Task 05–08, rồi chạy R10: CI, UI E2E, Windows/Ubuntu, backup/restore và soak 2 giờ.
7. Mỗi commit ghi test đã chạy và output. Phần thiếu Page/session/bài kiểm thử thật ghi NOT RUN. Chỉ đánh dấu task ĐẠT khi đủ tiêu chí ban đầu; không dùng câu “12/12 hoàn thành” chỉ từ 6 suite exit 0.

Giữ công việc trên nhánh feature đến khi các P1 được đóng và test nghiệm thu được bổ sung. Lượt review này không sửa mã nguồn nghiệp vụ, không merge và không gửi bình luận thật.
