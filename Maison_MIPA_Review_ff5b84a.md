# Maison MIPA — Review commit ff5b84a và task sửa tiếp

Ngày kiểm tra: 06/10/2026. Nhánh: `feat/complete-lead-hub`.
Commit kiểm tra: `ff5b84a6df0f182d2ac453cd24644120c3937d11`.
[Mã nguồn cố định](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/tree/ff5b84a6df0f182d2ac453cd24644120c3937d11).

## Kết luận

Commit đã được push và có những sửa đổi hữu ích. Chưa đủ điều kiện nghiệm thu tool hoàn thiện hoặc merge để vận hành tự động. Các lỗi dưới đây được tách theo tình huống cụ thể, kèm cách sửa và test nghiệm thu để giao tiếp cho AI lập trình.

Review chỉ đọc source và chạy kiểm tra trong bản sao riêng. Không sửa hoặc push lên repository của chủ dự án. Không đăng bình luận Facebook thật.

## Những phần đã xác minh là cải thiện

- Migration trên DB rỗng tạo được schema; chạy lần hai bỏ qua version đã áp dụng.
- Repository sinh ID cho nhóm/bài mới. Bài và classification được insert trong transaction; confidence 85.00 lưu được trên schema mới.
- Job completed có thể lên lịch và claim lại; attempts của chu kỳ mới được reset.
- API bình luận và worker đã dùng chung service outreach PostgreSQL; UNIQUE(post_id) chặn hai lần claim cho cùng bản ghi bài.
- Token chỉ thu hồi trong DB được verifyAuth từ chối 401 khi DB truy cập bình thường.
- Build production không cấp APP_SECRET, DATABASE_URL hoặc FACEBOOK_SESSION_ENCRYPTION_KEY đã hoàn tất exit 0.
- Parser không còn ưu tiên ID theo mong muốn caller; fixture personal ID 222 riêng lẻ bị từ chối khi yêu cầu Page 111.
- Counter soak đã kiểm tra số lần tiếp cận thành công và số lần bị chặn, cải thiện so với counter luôn bằng 0 trước đây.

Các điểm này không chứng minh hoàn tất mọi luồng, đặc biệt nâng cấp DB cũ, quyền sở hữu job và xác minh danh tính có evidence xung đột.

## Phạm vi kiểm thử

SQL/repository diagnostic dùng engine PostgreSQL nhúng PGlite, thay Pool bằng adapter test để chạy chính migration/repository/service của commit. Đây không phải pg-mem và không phải PostgreSQL server nhiều connection. Các kết quả bên dưới chứng minh SQL, constraint, trạng thái và đường điều phối; không chứng minh distributed locking khi có nhiều connection thật.

Dispatcher được kiểm tra bằng callback DOM thật của hàm, chạy trên fixture. Service gửi dùng stub dispatcher để đo số lần gọi, trạng thái và độ chồng lấn. Không coi kết quả stub là gửi Facebook thành công.

Test TypeScript chạy qua Node loader và shim gọi process con vì CLI tsx dùng IPC không được môi trường kiểm tra cho phép. Shim không đổi assertion nghiệp vụ. Production build chạy bằng npm run build thông thường. Kết quả master runner và regression được ghi riêng; không đồng nhất số assertion với nghiệm thu nghiệp vụ.

PostgreSQL server/Docker thật, Windows thật, Facebook thật và soak 2 giờ chưa được chạy trong lượt review này.

| Kiểm tra thực hiện | Kết quả |
|---|---|
| Phase A/B/C/D của runner | 21/15/21/32 assertions đạt |
| Soak mặc định | 5 giây; worker loops claim 3 + 2 jobs; 0 duplicate claims; 1 first-touch |
| Backup/restore suite hiện có | Đạt trên pg-mem; chưa xóa dữ liệu trước restore |
| Master runner, bắt đầu với data mới và chạy tuần tự | 6/7 suites; regression lỗi assertion EIO rồi timeout file lock 45 giây; exit 1 |
| Regression chạy riêng, bỏ khóa sót trong bản sao kiểm thử | 50/50 đạt, exit 0 |
| Build production không cấp ba biến secret/DB nêu trên | Đạt, exit 0 |
| Diagnostic PGlite + DOM/stub | Tái hiện các trường hợp N01–N05, N08–N10; N06/N07 là phân tích source |

Kết quả runner không ổn định giữa chạy riêng và chạy toàn bộ cần được điều tra. Không quy lỗi riêng assertion EIO này thành lỗi mất dữ liệu production: đây là lỗi bộ kiểm thử/khóa quan sát trong môi trường review, chạy với Node loader/shim đã mô tả. Nhưng kết quả này không xác nhận tuyên bố 7/7 trên mọi lần chạy. Phải cô lập dữ liệu giữa suites và chạy lại bằng lệnh chuẩn trong CI/môi trường đích.

## N01 — P1: Không nâng cấp schema đã áp dụng migration 001

Nguồn: [migrations](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/tree/ff5b84a6df0f182d2ac453cd24644120c3937d11/src/lib/db/migrations), `src/lib/db/migrate.ts:43–52`.

Chỉ có `001_initial_schema.sql`. Commit sửa confidence trong migration cũ; runner bỏ qua file nếu version 1 đã có. DB của người dùng đã cài trước đó giữ `NUMERIC(5,4)`.

Tái hiện: tạo schema bằng migration của 1083bd7, ghi version 1, chạy runner mới. Kết quả applied=[], skipped=[001]; numeric_precision=5, numeric_scale=4. Tạo bài tiếp theo vẫn trả `22003: numeric field overflow`.

Task: thêm migration 002 ALTER COLUMN sang NUMERIC(5,2), thống nhất CHECK 0..100 và xử lý dữ liệu cũ theo thang đã xác định. Không sửa migration đã phát hành để thay cho migration nâng cấp. Test DB rỗng, DB version 1 có dữ liệu thật, chạy lại migration và bảo toàn bản ghi.

## N02 — P1: Danh tính xung đột vẫn lọt qua nhánh switcher

Nguồn: [dispatcher.ts](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/src/worker/dispatcher.ts), dòng 603–627, đặc biệt 619–625.

Hàm đọc tổng hợp composer và phát hiện mâu thuẫn trước. Tuy nhiên, sau khi initialMatch bị từ chối, hàm đọc text switcher riêng và trả matched=true nếu text này khớp. Nhánh đó bỏ qua evidence avatar và conflicts vừa phát hiện.

Tái hiện bằng callback thật: avatar Personal Profile liên kết facebook.com/222; switcher ghi Interacting as Maison MIPA [Page ID: 111]. Yêu cầu Page 111. Hàm trả matched=true, activePageId=111, conflicts=[] mà chưa click chuyển danh tính. Đây là fixture mâu thuẫn, không phải bằng chứng chắc chắn Page đang hoạt động.

Task: xóa đường chấp nhận từ switcher text riêng khi evidence tổng hợp đang personal/unknown/conflicting. Sau chuyển phải đọc lại cùng một composer và cùng tập evidence. Định vị composer gắn với textbox sẽ gửi; không fallback toàn document khi không xác định được composer. Auto-dispatch bắt buộc Page ID hợp lệ; tên không đủ thay thế. Test cả avatar 222 + switcher 111, avatar 111 + switcher 222, nhiều composer, menu liệt kê Page đúng nhưng voice đang sai, thiếu ID và trường hợp ID đúng thống nhất.

## N03 — P1: Worker cũ vẫn sửa job đã được worker khác nhận lại

Nguồn: [job.repository.ts](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/src/lib/repositories/job.repository.ts), dòng 82–93, 160–218.

recoverStuckJobs lấy lại job sau 5 phút, không có gia hạn lease của job đang chạy. completeJob/failJob/releaseJob chỉ lọc id; không yêu cầu đúng locked_by hoặc claim token. Job hợp lệ kéo dài quá 5 phút cũng có thể bị thu hồi.

Tái hiện: worker 2 claim job; đưa locked_at về 6 phút trước; recovery; worker 3 claim lại; worker cũ completeJob(id). Job của worker 3 bị chuyển completed và locked_by=null.

Task: mỗi lần claim có generation/claim token; renew lease khi xử lý; mọi finalize/retry/release dùng WHERE id + claim token + owner + trạng thái phù hợp. Worker mất lease không được commit kết quả. Job đã hết retry budget chuyển failed, không thành pending nhưng không ai claim được. Khi enqueue job có sẵn, không ghi đè run_at của lần retry hoặc payload đang chạy.

Nghiệm thu: hai process thật trên PostgreSQL, tác vụ sống vượt timeout, kill -9/restart, worker cũ trả kết quả muộn, scheduler chạy đồng thời. Chỉ chủ hợp lệ được đổi trạng thái; retry giữ backoff.

## N04 — P1: Service gửi bỏ qua quyền nhóm và khóa theo Page

Nguồn: [outreach-dispatch.service.ts](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/src/lib/services/outreach-dispatch.service.ts), dòng 52–123; worker index dòng 107–123 và 157–172.

Service chỉ lấy bài và claim post_id. Không kiểm tra group.can_page_comment, trạng thái Page đã xác minh, template còn duyệt, cấu hình tạm dừng, quota/cooldown; không khóa theo Page. UNIQUE(post_id) chỉ chống trùng trên cùng bản ghi bài.

Tái hiện: đặt can_page_comment=false; gọi service đồng thời cho hai bài trong nhóm, cùng Page 111. Stub dispatcher được gọi 2 lần, maxActive=2, cả hai service trả success=true. Không có bình luận thật được đăng.

Task: tập trung kiểm tra quyền và cấu hình ngay trước submit trong service dùng chung; phân biệt lời duyệt tay với auto job. Có khóa/lease Page qua DB, giới hạn cấu hình chung giữa web và các worker; dừng/tạm dừng phải tác động cả job dispatch đã xếp hàng. Template auto phải tồn tại, còn duyệt và đúng version. Không cho payload job tự thay Page ngoài cấu hình được cấp quyền.

Nghiệm thu: nhóm cấm Page → không gọi dispatcher; hai bài cùng Page → tối đa một submit hoạt động; tắt auto khi job chờ → không gửi; thu hồi template trước submit → bị chặn; cùng một bài claim từ API và worker → chỉ một bên được gửi.

## N05 — P1: Lỗi trước submit khóa bài vĩnh viễn

Nguồn: service dòng 61–75, 125–137; [outreach.repository.ts](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/src/lib/repositories/outreach.repository.ts), claimFirstTouch.

Claim được insert trước khi dispatcher kiểm tra session. Khi không có session, dispatcher trả rejected/needsAuth mà chưa submit; service đổi status thành failed nhưng giữ UNIQUE(post_id). Lần thử sau luôn bị từ chối là đã tiếp cận, dù người dùng đã bổ sung session.

Tái hiện: lần đầu stub trả rejected + needsAuth + chưa submit. Lần hai stub đã có thể gửi thành công, nhưng service trả chống trùng và không gọi dispatcher (retryCalls=0).

Task: thiết kế state machine và bằng chứng submit riêng. Trường hợp chắc chắn chưa submit cho phép lấy lại claim bằng CAS/transaction; lưu audit lần cũ. Trường hợp đã submit hoặc chưa xác định giữ khóa chống gửi lại và có luồng đối soát. Không xóa interaction rồi gửi lại một cách mù quáng. Crash ở sending cần reconciliation; không để trạng thái treo vĩnh viễn. Lỗi tạo CRM sau sent_confirmed không được hạ kết quả bình luận đã xác nhận xuống uncertain_failed.

Nghiệm thu: thiếu session, sai Page, lỗi navigation trước Enter được thử lại có kiểm soát; mất mạng/crash sau Enter không tự gửi lại; hai yêu cầu retry đồng thời chỉ một bên thắng; lỗi CRM có thể phục hồi độc lập.

## N06 — P1: API vẫn chạy trình duyệt trực tiếp trong container web

Nguồn: [comment route](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/src/app/api/posts/%5Bid%5D/comment/route.ts), group check route, `Dockerfile`, `Dockerfile.worker`.

Bình luận từ UI gọi service → Playwright ngay trong process Next.js. Quét ngay cũng gọi crawler trực tiếp. Docker web dùng node:20-alpine, npm ci nhưng không có bước cài browser/runtime Playwright; chỉ worker dùng image Playwright. Sửa service PostgreSQL chưa làm UI thực thi qua worker. Kết luận này dựa trên source Docker/route, chưa chạy Docker thật.

Task: API tạo job bền vững, trả job ID và trạng thái chờ; worker chạy Playwright rồi ghi kết quả. UI polling/stream trạng thái thật và hiển thị needs_auth/uncertain. Quét tay và lịch tự động cùng queue, tránh hai browser crawl cùng nhóm. Không đánh dấu đã gửi khi mới enqueue. Kiểm tra quyền thư mục shared_data cho user chạy web/worker và bootstrap migration/readiness.

Nghiệm thu: Docker cài mới, web không cần browser, quét ngay và duyệt gửi hoàn tất qua worker; restart web không mất job; worker offline hiển thị chờ/offline; thất bại không trả thành công giả.

## N07 — P1: Lỗi quét tạm thời làm nhóm ngừng được theo dõi

Nguồn: [worker index](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/src/worker/index.ts), dòng 27, 65–81, 153–157.

Scheduler chỉ lấy nhóm active; executeCrawlJob cũng bỏ qua nhóm không active. Khi crawlResult.success=false vì lỗi mạng, hàm đặt nhóm error rồi return 0; caller vẫn completeJob. Nhóm đó không còn được scheduler lấy lại, nên một lỗi tạm thời có thể chấm dứt quét định kỳ cho đến khi sửa trạng thái thủ công. Đây là phân tích control flow từ source.

Task: phân biệt lỗi transient, needs_auth, không có quyền nhóm và cấu hình paused. Lỗi transient phải fail/retry job với backoff; giữ nhóm đủ điều kiện recovery. needs_auth dừng và có luồng resume sau xác thực. Không đánh dấu completed khi crawler thất bại.

Nghiệm thu: lần 1 timeout mạng, lần 2 thành công; nhóm tiếp tục ít nhất 3 chu kỳ 150 giây. Checkpoint dừng an toàn và resume được; nhóm paused không chạy. Phải đo theo từng nhóm khi nhiều nhóm chạy chung worker.

## N08 — P2: Backup chưa phải snapshot nhất quán; restore không khôi phục dữ liệu đã đổi

Nguồn: [backup-db.ts](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/scripts/backup-db.ts), dòng 43–48; [restore-db.ts](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/scripts/restore-db.ts), dòng 90–99; test-backup-restore.ts dòng 87–101.

Backup dùng BEGIN thông thường; default_transaction_isolation quan sát là read committed. Các SELECT không được đảm bảo cùng một snapshot giữa các bảng khi có writer khác. Đây là hệ quả isolation, chưa mô phỏng writer độc lập trên server thật trong lượt này.

Restore dùng ON CONFLICT DO NOTHING. Tái hiện: backup nhóm, đổi tên nhóm sau backup rồi restore. Script báo hoàn tất, restoredRecords=0 và tên vẫn là Changed after backup. Test mới restore vào chính DB chưa xóa, cho phép restoredRecords>=0 và chỉ kiểm tra các bản ghi vốn còn nguyên; không chứng minh disaster recovery.

Task: backup dùng snapshot nhất quán hoặc công cụ PostgreSQL chuẩn; ghi schema/version/checksum và fail nếu schema bắt buộc thiếu. Định nghĩa rõ restore vào DB rỗng hoặc restore thay thế/upsert có kiểm soát. Không để một lần bỏ qua toàn bộ bản ghi được báo là đã khôi phục nội dung. Không tự thực hiện restore phá dữ liệu production để test.

Nghiệm thu: restore vào DB test hoàn toàn mới sau migration; kiểm tra số lượng, toàn bộ dữ liệu và quan hệ, cả JSONB/session/revocation. Test writer đồng thời khi backup, lỗi giữa restore rollback toàn bộ, và dữ liệu mục tiêu đã thay đổi theo chính sách công bố.

## N09 — P2: Auth bỏ qua lỗi đọc/ghi thu hồi token trong DB

Nguồn: [auth.ts](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/src/lib/auth.ts), dòng 156–167, 202–212.

Đường async đã được gọi, nhưng isTokenRevokedAsync catch lỗi rồi trả false; revokeTokenAsync cũng chỉ cảnh báo khi DB ghi thất bại. Token chỉ bị thu hồi trong DB có thể không được áp dụng ở instance không có file chung khi truy vấn DB lỗi. Logout có thể báo thành công mà chưa có revocation trong kho chung.

Tái hiện điều kiện fail-open: stub authRepo.isTokenRevoked ném lỗi DB; token ký hợp lệ không có trong file/RAM vẫn được verifyAuth chấp nhận success=true/status=200. Đây không chứng minh một token đã thu hồi cụ thể vượt qua mọi deployment; nó chứng minh lỗi kiểm tra bị coi là chưa thu hồi.

Task: dùng DB làm nguồn session/revocation chung; lỗi xác minh trả lỗi dịch vụ/không cho hành động yêu cầu auth, không coi là token hợp lệ. Await persistence; không nuốt lỗi. Hoàn thiện tài khoản cá nhân/password hash thay ba account role cố định; worker không có quyền admin toàn bộ. Cookie đăng nhập HttpOnly và chính sách token client cần hoàn thiện theo Task 09.

Nghiệm thu: login/logout từ các process không chia sẻ filesystem; DB mất kết nối trong verify/logout; restart; account bị vô hiệu hóa; cookie/RBAC và worker scope.

## N10 — P2: Nhập bài không chọn nhóm lỗi FK; auto-heal classification không tới được

Nguồn: [posts route](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/src/app/api/posts/route.ts), dòng 56–62; [post.repository.ts](https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub/blob/ff5b84a6df0f182d2ac453cd24644120c3937d11/src/lib/repositories/post.repository.ts), dòng 158–172 và 211–243.

API POST không có group_id tự gán grp-manual, nhưng DB cài mới không có nhóm đó. Tái hiện request có link và content hợp lệ, không group_id: HTTP 500 vì facebook_posts_group_id_fkey. Có thể lưu group_id=null vì schema cho phép, hoặc tạo nhóm nhập tay theo một thiết kế rõ ràng.

Auto-heal classification nằm trong nhánh INSERT gặp conflict, nhưng hai kiểm tra dedup đầu hàm return sớm khi bài đã tồn tại. Tái hiện: xóa classification của bài để mô phỏng dữ liệu dở dang từ phiên bản cũ, nhập lại cùng URL. Hàm trả isNew=false; số classification vẫn 0.

Task: sửa nhập tay trên DB rỗng, validate group_id sai trả lỗi đầu vào phù hợp; phục hồi classification trước khi return bài cũ hoặc có repair job riêng. Return classification của đúng bài đã lưu. Test batch import, bài cũ thiếu classification và hai bài Facebook có ID khác nhau.

## N11 — P2: Còn khoảng trống nghiệm thu test, session và vận hành

Nguồn: tests/test-soak.ts dòng 12, 57–120; `src/worker/auth.ts:54–62,95–98`; start.sh/start.ps1; không có .github/workflows trong commit.

Soak mặc định vẫn 5 giây, hai vòng async cùng process; chưa phải hai worker OS thật trên PostgreSQL trong 2 giờ. Các counter đã sửa đúng hơn nhưng chưa đủ tiêu chí Task 12. Session save vẫn ghi cả bản AES-GCM và plaintext JSON; getSessionPath còn giải mã rồi ghi JSON. clearPlaintextSession không phải luồng vận hành cuối cùng. Native start vẫn chạy dev; fallback/mirror JSON còn trong nhiều route, khiến dev và production khác hành vi. Giao diện có bảng/helper chưa đồng nghĩa CRUD/Page management/tài khoản cá nhân đã nối đủ.

Task: dùng storageState object giải mã trong bộ nhớ, không lưu plaintext lâu dài; chuẩn hóa production start và env precedence. Loại fallback JSON khỏi nghiệp vụ sau migration. Thêm CI và test server PostgreSQL thật. Test mỗi suite có dữ liệu/thư mục riêng và dọn lock/fixture để chạy lại không phụ thuộc lần trước.

Nghiệm thu cuối: clean install Windows + Ubuntu + Docker; upgrade DB cũ; hai process worker + kill/restart; soak >=2 giờ; UI E2E trên luồng nhóm→bài→duyệt→job→outreach→CRM; backup→DB rỗng→restore; test Facebook có quyền và phạm vi thử nghiệm được chủ dự án chấp thuận. Báo rõ mọi hạng mục chưa chạy.

## Thứ tự giao việc cho AI

1. N01 + N10: schema nâng cấp, dữ liệu cũ, nhập bài/repair classification.
2. N02 + N03: danh tính Page và quyền sở hữu job/lease.
3. N04 + N05 + N06: quyền gửi, khóa Page, state machine và API enqueue qua worker.
4. N07: lịch quét lặp, retry/resume và lỗi mạng.
5. N08 + N09: sao lưu/restore và session/revocation chung.
6. N11: đóng các tiêu chí còn lại của 12 task và chạy nghiệm thu môi trường thật.

Không merge main hoặc chạy gửi rộng chỉ dựa trên build xanh hay số assertion. Mỗi nhóm task cần commit nhỏ, test tái hiện lỗi trước sửa, test sau sửa và bằng chứng theo tiêu chí ở trên.

## Prompt giao tiếp cho AI lập trình

> Tiếp tục trên feat/complete-lead-hub từ ff5b84a6df0f182d2ac453cd24644120c3937d11. Đọc bản review này và bản yêu cầu 12 task trước khi sửa. Hoàn thành N01–N11 theo thứ tự; giữ các cải thiện đã chạy đúng. Kiểm tra bằng đường API/worker thực tế, không chỉ helper. Không hardcode secret, không chấp nhận Page chỉ theo tên khi auto-dispatch, không mở retry cho bài đã submit hoặc chưa xác định. Không thay test để che lỗi, không coi pg-mem/fixture là Facebook hoặc PostgreSQL server thật. Khi thiếu môi trường để nghiệm thu, ghi rõ chưa chạy và cung cấp script có thể chạy lại. Báo cáo cuối phải có SHA, file thay đổi, kết quả từng test/môi trường, và phần chưa đạt; không tuyên bố hoàn thiện 100% nếu tiêu chí còn thiếu. Giữ thay đổi trên nhánh feature và trình kết quả trước khi merge main.
