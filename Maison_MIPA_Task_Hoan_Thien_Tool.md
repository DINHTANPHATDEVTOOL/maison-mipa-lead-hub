# TASK CHO AI LẬP TRÌNH — HOÀN THIỆN MAISON MIPA LEAD HUB

## 1. Vai trò, mã nguồn và kết quả cần đạt

Bạn là kỹ sư phụ trách hoàn thiện ứng dụng vận hành cho tiệm ảnh Maison MIPA Memories. Hãy triển khai, kiểm thử và bàn giao mã nguồn chạy được; không dừng ở việc đề xuất cách làm hoặc thêm helper chưa được sử dụng.

- Repository: https://github.com/DINHTANPHATDEVTOOL/maison-mipa-lead-hub
- Mốc đã được review: `fa4171e826b456f9728a2daaa9df37666581db68`.
- Trước khi sửa, lấy HEAD mới nhất, đọc AGENTS.md nếu có, xem diff sau mốc trên và giữ các thay đổi hợp lệ đã có.
- Tạo nhánh `feat/complete-lead-hub`; chia commit theo các task dưới đây. Không tự ghi đè nhánh main hoặc triển khai lên production.
- Tiếp tục xử lý trong phạm vi task cho đến khi đạt nghiệm thu. Thiếu tài khoản Facebook hoặc môi trường Windows thì hoàn thành các phần độc lập và ghi rõ phần chưa kiểm chứng.

**Kết quả sử dụng:** Admin nhập link nhóm một lần. Worker tự theo dõi bài mới mỗi 120/150/180 giây, nhận dạng nhu cầu chụp ảnh, chọn mẫu phù hợp, gửi bình luận bằng đúng Page khi đủ điều kiện, chống tiếp cận trùng, lưu lịch sử và bàn giao cho CSKH. Web/worker có hướng dẫn chạy trên Windows và Ubuntu. Đóng tab web không làm dừng worker.

## 2. Phạm vi và công nghệ

Tiếp tục nền tảng hiện có: Next.js, React, TypeScript, Tailwind CSS, Node.js, Playwright và PostgreSQL qua `pg`. Kiểm tra phiên bản được hỗ trợ và bản vá bảo mật từ tài liệu chính thức trước khi chọn phiên bản cuối; đồng bộ package-lock, Docker image và trình duyệt Playwright. Không đổi framework chỉ để viết lại dự án.

PostgreSQL là nguồn dữ liệu nghiệp vụ duy nhất khi vận hành. Dùng migration có phiên bản. Có thể dùng bảng jobs của PostgreSQL để điều phối lịch quét và gửi; nếu giữ Redis/BullMQ thì phải triển khai thật, kiểm thử thật và cập nhật dependency. Không để README mô tả Redis/BullMQ trong khi code không dùng.

Quản lý Page ở đây gồm Page được cấu hình, quyền truy cập nhóm, phiên đăng nhập và danh tính bình luận. Không coi đây là yêu cầu xây lại mọi chức năng quảng cáo, thanh toán và đăng bài của Meta Business Suite. Bản đầu hoàn thiện một Page và một phiên Facebook hoạt động; mô hình dữ liệu cho phép bổ sung nhiều Page sau.

Theo dõi nhóm luôn tự động. Bình luận có hai chế độ: `manual_review` và `auto_dispatch`; mặc định duyệt trước. Admin bật tự động sau khi cấu hình Page, dịch vụ, mẫu và giới hạn vận hành. Không yêu cầu nhân viên tìm bài rồi nhập thủ công để thay thế chức năng theo dõi nhóm.

## 3. TASK 01 — Chuyển toàn bộ dữ liệu nghiệp vụ sang PostgreSQL [P1]

**Nguồn liên quan:** `src/lib/store.ts`, các API route, `schema.sql`, worker và Docker Compose.

- Thay cơ chế đọc–sửa–ghi JSON/lease/commit marker bằng repository/service truy cập PostgreSQL. Chuyển các caller sang async và await đầy đủ.
- Mọi thao tác tạo/sửa nhóm, bài viết, phân loại, tiếp cận, lead, cấu hình và heartbeat phải đi qua repository mới. Production không fallback sang JSON khi database lỗi.
- Transaction chỉ bao quanh thao tác database; không giữ transaction/row lock trong suốt lúc chờ Playwright hoặc Facebook.
- Thiết kế bảng cho groups, pages, sessions, services, templates/version, posts, classifications, outreach, outreach attempts, leads, worker heartbeats, settings, jobs và audit events. Có FK, index, constraint và mốc thời gian UTC.
- Khóa chống trùng theo khóa bài Facebook được chuẩn hóa; URL hash là phương án bổ sung. Không gộp hai bài có ID Facebook khác nhau chỉ vì nội dung và tác giả giống nhau.
- Có ràng buộc cho một lần tiếp cận logic trên mỗi bài trong toàn tiệm. Chỉ ghi thêm attempt khi được phép; dùng update có điều kiện/row lock để hai worker không cùng claim.
- Các cập nhật cạnh tranh trên lead/template có version hoặc điều kiện cập nhật để không âm thầm ghi đè chỉnh sửa của nhân viên khác. Trả 409 để UI yêu cầu tải lại khi xung đột.
- Database unavailable phải báo lỗi rõ ràng, readiness không đạt; không trả thành công giả.

**Migration:** backup JSON cũ; ánh xạ ID dạng `grp-...`, `post-...`, `srv-...` sang ID/schema mới có kiểm soát; bảo toàn quan hệ, trạng thái đã tiếp cận và dữ liệu CRM. Script dry-run báo tổng bản ghi, trùng và lỗi; migration chạy lại không tạo bản ghi trùng. Production mới khởi tạo rỗng; dữ liệu demo chỉ qua seed riêng trong môi trường demo/test.

**Nghiệm thu:** restart web và worker vẫn đọc được dữ liệu; hai tiến trình cập nhật đồng thời không mất bản ghi; DB mất kết nối không làm app chuyển về JSON; di chuyển dữ liệu cũ giữ nguyên trạng thái chống gửi trùng.

## 4. TASK 02 — Gửi bình luận bằng đúng Page [P1]

**Nguồn:** `src/worker/dispatcher.ts`, cấu hình Page và DOM fixtures.

- Production tự động bình luận phải có Page ID hợp lệ; tên Page là thông tin hiển thị, không là bằng chứng duy nhất.
- Viết hàm đọc danh tính có cấu trúc: `activePageId`, `activeName`, `identityType`, `evidenceSource`, `conflicts`. Gắn bằng chứng với đúng composer sẽ nhập và gửi bình luận.
- Chỉ lấy ID từ avatar/link/thuộc tính thể hiện danh tính đang dùng trong composer. Không gom tất cả link trong form hoặc document rồi tìm chuỗi chứa Page ID.
- So sánh ID bằng equality sau khi parse, không `includes`. Thiếu bằng chứng hoặc bằng chứng mâu thuẫn phải từ chối gửi.
- Sau khi chuyển Page, chờ trạng thái mới và đọc lại. Kiểm tra lại composer ngay trước khi nhấn gửi. Nếu nhận dạng lại thất bại, giữ lý do từ chối rõ ràng.
- Tách selector tiếng Việt/Anh thành adapter có fixtures; không chọn nút menu bất kỳ trên toàn trang làm nút chuyển Page.

**Test bắt buộc:** đúng Page; sai Page trùng tên; chỉ tên không ID; Page ID là chuỗi con của ID khác; danh tính cá nhân 222 nhưng có link Page 111 ở nơi khác; có cả ID đúng và ID xung đột; avatar đúng tên và link danh tính đúng ID; đổi Page chưa hoàn tất; trang có nhiều composer.

## 5. TASK 03 — Xác minh bình luận mới và chống gửi lại [P1]

- Tách nội dung bình luận, tác giả và thời gian thành các trường riêng. So khớp toàn văn nội dung sau chuẩn hóa, không dùng toàn bộ text của container chứa cả reply và metadata.
- Chụp các comment ID trước khi gửi; sau gửi chỉ xác nhận bản mới, đúng bài, đúng Page, đúng nội dung và có bằng chứng tạo sau lần gửi.
- Ưu tiên comment ID từ kết quả submit/network được quan sát hợp lệ trong phiên hoặc timestamp rõ ràng. Nếu dùng timestamp có sai số, nêu quy tắc và chứng minh bằng test.
- Nhãn thời gian tương đối phải đối chiếu với thời gian thực từ lúc gửi và xét khoảng làm tròn. Sau gửi 1,5 giây mà bình luận ghi “10 seconds ago” thì không được xác nhận mới.
- Timestamp cũ không được bị nhãn “vừa xong/seconds ago” ghi đè. Thiếu bằng chứng đủ chắc chắn thì `uncertain_failed`; không tự gửi lại.
- Mô hình trạng thái: `queued → claimed → sending → sent_confirmed`, hoặc `rejected_before_submit`, hoặc `uncertain_failed`. Ghi thời điểm ngay trước thao tác có thể submit. Crash sau mốc này phải được xử lý như kết quả chưa xác định, trừ khi có bằng chứng chắc chắn chưa gửi.
- Một request/job lặp lại phải trả lại trạng thái đã có. Lưu content/template version/Page/operator theo attempt để truy vết.
- Thao tác “kiểm tra lại” chỉ xác minh, không gửi. Nhân viên giải quyết trạng thái chưa xác định bằng bằng chứng và audit. Không tạo nút retry tự động bỏ qua khóa chống trùng.
- `manual_assisted` là nhân viên đã tiếp cận và ghi nhận bằng chứng, không đồng nghĩa Facebook đã được app xác minh gửi thành công.

**Nghiệm thu:** đúng bình luận mới mới được xác nhận; bình luận cũ tải muộn, bình luận của Page khác, khác phần giá cuối, reply chứa câu giống mẫu, hoặc mất mạng sau Enter không được xác nhận nhầm. Hai request đồng thời chỉ có một request được thực hiện submit.

## 6. TASK 04 — Worker, lịch quét và hàng đợi bền vững [P1]

**Nguồn:** `src/worker/index.ts` hiện dùng `setInterval(async ...)`; phải loại khả năng chu kỳ chồng nhau.

- Lưu job/lịch chạy trong DB. Claim bằng transaction và cơ chế loại trừ job đang chạy, ví dụ `FOR UPDATE SKIP LOCKED`; có owner, deadline và recovery phù hợp.
- Một nhóm không quét chồng nhau; một Page không có hai luồng cùng đổi danh tính/gửi. Worker thứ hai không nhân đôi lịch hoặc submit.
- Đặt lịch theo 120/150/180 giây, mặc định 150. Quét kéo dài thì không tạo vô hạn job bù; hiển thị độ trễ lịch và giới hạn concurrency.
- Tách job quét, phân loại và gửi. Quét vẫn chạy khi bình luận đang đợi duyệt. Nhóm lỗi không làm dừng nhóm khác.
- Timeout và backoff cho lỗi đọc trước submit. Với gửi không rõ kết quả, không áp dụng retry giống job đọc.
- Đăng nhập hết hạn/checkpoint: dừng tác vụ cần phiên đó, cập nhật `needs_auth`. Lỗi mạng tạm thời được phục hồi có giới hạn; lỗi quyền nhóm không retry vô hạn.
- Heartbeat phát độc lập với chu kỳ dài; phân biệt process sống, session hợp lệ và job đang chạy. Không sửa heartbeat thật khi Admin đổi cấu hình.
- Dừng worker an toàn, đóng browser/context và pool; ghi trạng thái task đang xử lý để recovery đúng sau restart.
- Có nút dừng toàn bộ bình luận tự động. Worker đọc lại trạng thái dừng/chế độ trước submit, không dùng cấu hình snapshot cũ của đầu chu kỳ.

**Nghiệm thu:** hai worker chạy cùng lúc không nhân đôi job; job 40 giây không chồng khi tick 30 giây; đóng web không dừng worker; restart khôi phục lịch và bảo toàn chống trùng. Chu kỳ 2–3 phút là mục tiêu khi đủ năng lực; nhóm chậm/quá tải phải hiển thị trễ thực tế.

## 7. TASK 05 — Quét nhóm Facebook tự động có kiểm chứng

- Admin thêm/sửa/tạm dừng/khôi phục/xóa mềm nhóm; chuẩn hóa URL, chống trùng nhóm, cấu hình khoảng quét, từ khóa, lookback và trạng thái quyền.
- Chỉ điều hướng đến URL Facebook có host/path hợp lệ. Kiểm tra URL được redirect; từ chối URL tùy ý và URL nội bộ để worker không thành công cụ truy cập mạng tùy ý.
- Dùng phiên đã đăng nhập và quyền có thật. Checkpoint, CAPTCHA hoặc yêu cầu tham gia nhóm phải dừng đúng trạng thái; không thêm cơ chế né chặn hoặc tự động đổi tài khoản để tiếp tục.
- Khi có tùy chọn bài mới nhất, chọn và xác minh trạng thái sắp xếp thật trong giao diện; thêm query parameter không đủ để báo đã sắp xếp.
- Cuộn phân trang có giới hạn; mở nội dung bị rút gọn khi cần; xử lý pinned post, suggested post, bài ẩn danh, bài sửa và link permalink.
- Lưu ID, URL, nội dung, nhóm, tác giả, thời gian xuất bản nếu xác định được, thời gian phát hiện và bằng chứng nguồn. Không biến thời gian không parse được thành “vừa đăng”; dùng null/unknown.
- Phân biệt quét thành công không có bài mới với selector hỏng/trang tải lỗi/không quyền. Ghi `last_attempt_at`, `last_success_at`, `next_check_at`, thời lượng, số bài và lỗi.
- Quyền đọc nhóm và quyền Page bình luận là hai trạng thái riêng; chưa biết quyền bình luận thì không tự đánh dấu cho phép.

**Nghiệm thu:** nhập link một lần rồi tự thu thập; reload cùng bài không tạo trùng; bài khác ID cùng nội dung vẫn riêng; nhóm không quyền không sinh dữ liệu giả; selector không khớp báo lỗi chẩn đoán.

## 8. TASK 06 — Quản lý Page và phiên Facebook

- Trang cấu hình cho Admin: Page ID/tên, phiên liên kết, trạng thái đăng nhập, kiểm tra quyền, thời điểm kiểm tra gần nhất và lỗi cần thao tác.
- Cung cấp lệnh kết nối bằng browser có giao diện cho Windows/Ubuntu; người vận hành đăng nhập và xử lý xác minh trong browser. Không yêu cầu paste mật khẩu Facebook vào app hoặc ghi mật khẩu vào log.
- Session được mã hóa bằng khóa riêng bắt buộc; chỉ định thư viện/cách lưu hỗ trợ đọc storageState trong memory hoặc file tạm có vòng đời ngắn. Không để bản plaintext lâu dài sau khi nạp.
- Ghi trạng thái “có dữ liệu phiên” và “đã xác minh phiên còn hoạt động” riêng biệt; kiểm tra cookie tồn tại không đủ kết luận đăng nhập thành công.
- Hỗ trợ thay phiên, xóa phiên và kiểm tra lại. Không trả cookie/session ra API cho Marketing/CSKH. Không dùng khóa suy từ hostname/username trong production.
- Nếu luồng Playwright không thể thực hiện ổn định với Page/nhóm thực tế, báo rõ giới hạn quan sát được và giữ chế độ hỗ trợ nhân viên; không giả lập kết quả để nghiệm thu.

## 9. TASK 07 — Nhận dạng nhu cầu và mẫu bình luận

- Phân loại: tìm dịch vụ chụp, quảng cáo/bán dịch vụ, bán thiết bị, tuyển người, spam, chưa rõ. Nhận dạng dịch vụ, khu vực, số người, ngày chụp, ngân sách và yêu cầu tạo dáng/phụ kiện/hậu kỳ.
- Giữ rule filter hiện có, bổ sung fixture tiếng Việt có dấu/không dấu, viết tắt và trường hợp phủ định. Không gọi confidence heuristic là xác suất AI đã được kiểm định.
- Nếu thêm LLM: bật tùy chọn bằng env/settings, output theo schema, timeout/cache/hạn mức; nội dung bài là dữ liệu không đáng tin cậy, không được điều khiển tool, cấu hình, giá hoặc hành động gửi.
- Giá và quyền lợi lấy từ dịch vụ Admin cấu hình. Chỉ render placeholder được phép; trường thiếu thì chuyển duyệt hoặc dùng mẫu được duyệt cho thiếu dữ liệu, không tự bịa.
- CRUD dịch vụ/mẫu, bật/tắt, duyệt mẫu, lưu version và preview. Mẫu chưa duyệt hoặc dịch vụ không hoạt động không được tự đăng.
- Giá trị mặc định từ bản demo phải được kiểm tra lại khi vận hành. Chủ tiệm xác nhận giá hiện tại; không tự đổi toàn bộ thành 700.000đ chỉ từ một caption cũ.
- Auto-dispatch chỉ khi đạt toàn bộ điều kiện: nhu cầu phù hợp, mẫu duyệt, Page đúng, quyền nhóm, phiên hợp lệ, giới hạn cho phép và bài chưa tiếp cận. Ngưỡng phân loại là một điều kiện, không là điều kiện duy nhất.
- Bài sửa nội dung phải có lịch sử/phân loại lại khi cần; bài đã tiếp cận không tự tiếp cận lần nữa.

## 10. TASK 08 — Hoàn thiện UI và CRM cho nhân viên

- Dashboard lấy số liệu thật: nhóm hoạt động, lần quét thành công, bài mới, bài cần duyệt, tiếp cận thành công/chưa xác định, lead và worker/session.
- Nhóm: CRUD và trạng thái, quét ngay qua cùng hàng đợi để không chạy chồng, lịch sử lỗi/quét.
- Hàng chờ: lọc/tìm kiếm/phân trang; xem bài gốc, kết quả phân loại, lý do chọn mẫu, preview, sửa trước khi duyệt, bỏ qua, ghi nhận thủ công và xác minh lại. Nút đang xử lý phải khóa chống double click.
- CRM: pipeline `uncontacted/replied/consulting/quoted/booked/lost`, ghi chú, người phụ trách, báo giá và ngày chụp; lưu lịch sử chỉnh sửa, liên kết bài/tiếp cận. Lead có thể tạo trước khi gửi nếu phù hợp, nhưng trạng thái nguồn/tiếp cận phải rõ ràng.
- PATCH chỉ cập nhật trường đã gửi; không xóa dữ liệu khác bằng undefined. Kiểm tra tiền/ngày/trạng thái phía server. UI xử lý xung đột cập nhật.
- Export CSV cho Admin/CSKH có filter, escape đúng và bảo vệ công thức nguy hiểm khi mở bảng tính. Không xuất cookie/token.
- UI tiếng Việt thống nhất, có loading/empty/error/401/403; cập nhật dữ liệu sau thao tác, không hiển thị toast thành công khi API thất bại. Nút nào hiển thị đều phải có hành vi thật.
- Không đưa dữ liệu mô phỏng vào môi trường thật. Chế độ demo tách DB/settings và luôn có nhãn rõ ràng.

## 11. TASK 09 — Xác thực, phân quyền và audit

- Admin quản lý cấu hình/Page/nhân viên/giá/chế độ. Marketing quản lý mẫu, hàng chờ và duyệt tiếp cận theo quyền. CSKH truy cập pipeline và export được phép. Enforcement ở API/service; header `x-user-role` không có quyền quyết định vai trò.
- Thay danh sách tài khoản theo vai trò dùng chung bằng tài khoản nhân viên riêng khi bàn giao sản phẩm hoàn chỉnh; password hash bằng thư viện được hỗ trợ, không plaintext. Có đổi/vô hiệu hóa tài khoản và thu hồi phiên.
- Ưu tiên cookie HttpOnly cho session web; không lưu session bí mật trong localStorage. Nếu còn bearer thì nêu lý do, thời hạn và thu hồi trong DB dùng chung.
- Logout thu hồi bền vững, giữa nhiều tiến trình và sau restart. Lỗi ghi revocation phải truyền lên, không báo thu hồi thành công giả.
- Worker credential riêng, quyền theo endpoint cần thiết; không mặc định cấp toàn quyền Admin cho worker key. Secret production bắt buộc, không hardcode/fallback công khai; log không chứa token/cookie/password.
- Validate body/query bằng schema; giới hạn kích thước; rate limit login, kiểm tra CSRF/Origin cho mutation dùng cookie, trả mã lỗi phù hợp 400/401/403/404/409/500/503.
- Audit ai đổi giá/mẫu/chế độ, duyệt/gửi/ghi nhận thủ công và sửa lead. UI chỉ hiển thị thông tin phù hợp với vai trò.

## 12. TASK 10 — Cài đặt, vận hành, backup và tương thích

- Docker Compose chạy web, worker và PostgreSQL với migration/healthcheck/volume; dependency không dùng phải bỏ hoặc giải thích rõ. Không đưa mật khẩu database cố định vào Compose.
- Có `.env.example` giá trị placeholder, hướng dẫn tạo secret và cấu hình Page; startup check báo rõ thiếu biến. Không commit `.env`, session hay dữ liệu khách.
- Scripts `setup.ps1`, `start.ps1`, `stop.ps1` cho Windows và `setup.sh`, `start.sh`, `stop.sh` cho Ubuntu; tránh `flock` hoặc đường dẫn Linux trong đường chạy native Windows.
- Tài liệu hai cách chạy: Docker Compose trên Ubuntu/Windows với điều kiện máy có Docker; native Node trên Windows/Ubuntu với PostgreSQL local hoặc remote. Browser Playwright cần được cài đúng phiên bản.
- Đóng trình duyệt UI không dừng dịch vụ. Restart worker không mất lịch. Cung cấp log có job ID/group ID/Page ID, health/readiness, trạng thái job và cảnh báo session hết hạn.
- Có backup database và restore được kiểm thử, backup session mã hóa riêng, hướng dẫn đổi secret. Giới hạn retention cho log/evidence; không lưu vô hạn ảnh chụp có dữ liệu khách.
- README mô tả đúng code đã chạy. Không nói “hỗ trợ Windows”, “BullMQ”, “PostgreSQL transaction” hoặc “đã E2E Facebook” nếu mới viết helper/fixtures.

## 13. TASK 11 — Bộ kiểm thử bắt buộc và bằng chứng

Không tăng số test bằng assertion kiểm tra chuỗi source hoặc chép lại thuật toán rồi test bản chép. Test phải thực thi module/callback thực tế.

| ID | Tình huống | Kết quả bắt buộc |
|---|---|---|
| DB-01 | Hai tiến trình OS sửa dữ liệu đồng thời, có barrier kiểm soát thứ tự | Cả hai thay đổi được giữ hoặc một bên nhận conflict có xử lý; không thành công giả |
| DB-02 | Writer cũ dừng trước commit, owner/job thay đổi rồi writer mới ghi | Writer cũ không ghi đè writer mới |
| DB-03 | DB ngắt kết nối khi lưu | API báo lỗi, không fallback JSON |
| DB-04 | Migration dữ liệu thật dạng JSON, chạy lại lần hai | Giữ đủ quan hệ, CRM, chống trùng; không nhân bản |
| JOB-01 | Hai worker cùng claim một nhóm/bài | Một tác vụ được thực thi |
| JOB-02 | Chu kỳ xử lý dài hơn nhịp scheduler | Không tạo vòng quét chồng |
| JOB-03 | Kill/restart worker trước và sau mốc submit | Recovery đúng; sau submit không rõ kết quả không tự gửi lại |
| PAGE-01 | Personal 222 có link Page 111 ở vùng khác | Từ chối gửi |
| PAGE-02 | Đúng tên sai ID, thiếu ID, ID là chuỗi con, bằng chứng xung đột | Từ chối gửi |
| PAGE-03 | Đúng avatar/link đang hoạt động; đổi Page chưa hoàn tất | Trường hợp đúng qua, trường hợp chưa đổi bị chặn |
| COMMENT-01 | Bình luận cũ tải muộn, có timestamp cũ và text “seconds ago” | Không xác nhận mới |
| COMMENT-02 | Gửi 1,5 giây, thấy nhãn “10 seconds ago”, thiếu datetime | Không xác nhận mới |
| COMMENT-03 | Khác giá ở cuối, tác giả khác, nội dung nằm trong reply | Không xác nhận nhầm |
| COMMENT-04 | Bình luận mới đúng bài/Page/toàn văn và bằng chứng mới | `sent_confirmed` cùng comment ID/permalink |
| COMMENT-05 | Enter xong mất mạng hoặc DB finalize lỗi | Chặn retry submit; trạng thái/evidence cho phép kiểm tra lại |
| AUTH-01 | Hai tiến trình đã load trước cùng thu hồi token khác nhau; tiến trình thứ ba xác minh | Cả hai token bị từ chối sau restart |
| AUTH-02 | Ghi revocation thất bại; giả role header; worker gọi endpoint ngoài quyền | Báo lỗi ghi; chặn vượt quyền |
| CRAWL-01 | Bài lặp, URL tracking, khác ID cùng nội dung, pinned post, giờ không parse được | Chống trùng đúng, không giả giờ/bài mới |
| CRAWL-02 | Không có bài mới so với selector lỗi và checkpoint | Trạng thái được phân biệt đúng |
| NLP-01 | Tìm chụp/bán lens/tuyển thợ/phủ định/prompt injection | Chọn nhu cầu/mẫu đúng, không tự bịa giá hoặc điều khiển gửi |
| UI-01 | Login → thêm nhóm → nhận bài → duyệt → tiếp cận → cập nhật CRM | Dữ liệu lưu thật, đúng quyền, đúng trạng thái |
| OS-01 | Cài mới và chạy theo hướng dẫn trên Windows và Ubuntu | Lệnh/scripts chạy được; ghi rõ phiên bản OS và kết quả |

Tổ chức unit tests cho parser/classifier/state machine; integration tests với PostgreSQL thật; Playwright tests với trang fixture có DOM thực và callback thật; browser E2E cho UI/API. Chạy test isolation theo database/schema riêng; không test trên production.

Kiểm thử Facebook thật chỉ dùng Page/nhóm/bài được chủ tiệm chỉ định làm bài kiểm thử. Nếu thiếu phiên hoặc bài kiểm thử, đánh dấu `NOT RUN` cùng lý do; vẫn hoàn thành fixture/integration và hướng dẫn thao tác. Không biến test mock thành bằng chứng đã bình luận thật.

Thiết lập CI chạy typecheck, lint, unit, DB integration, fixture/UI tests và build. Job Windows riêng cho các phần hỗ trợ native Windows. Lệnh test không phụ thuộc shell-specific quoting hoặc IPC chỉ hoạt động trên một OS. Lưu output và exit code, không chỉ số lượng assertion.

## 14. TASK 12 — Kiểm thử vận hành và bàn giao

- Chạy soak test ít nhất 2 giờ với fixture nhiều nhóm, hai worker, restart, mạng/DB lỗi có kiểm soát. Đo số job trùng, job trễ, lỗi browser, tài nguyên và heartbeat.
- Khi có môi trường Facebook thử nghiệm, ghi khả năng quét thực tế theo số nhóm, interval và thời gian quét; không hứa luôn quét đúng 2–3 phút cho mọi số nhóm.
- `npm ci`, typecheck/lint, test suites và production build phải pass trong môi trường được khai báo. Không coi build pass là nghiệm thu nghiệp vụ.
- Kiểm tra backup/restore khôi phục cả dữ liệu CRM và trạng thái chống tiếp cận trùng.
- Dọn code/demo/dependency không dùng; cập nhật tài liệu cài đặt, vận hành, kết nối Facebook, xử lý `uncertain_failed`, sửa selector và khôi phục lỗi.
- Bàn giao commit SHA/nhánh, danh sách file chính, migrations, scripts, báo cáo test và giới hạn chưa kiểm chứng. Không dùng câu “đã sửa triệt để” nếu còn test bắt buộc chưa chạy hoặc P1 chưa đóng.

## 15. Thứ tự thực hiện và cổng nghiệm thu

| Giai đoạn | Task | Điều kiện chuyển bước |
|---|---|---|
| A — Dữ liệu | 01, nền tảng 09 | DB/migration/concurrency/auth integration đạt |
| B — Gửi an toàn | 02, 03 | Page và freshness fixtures đạt; chống submit trùng đạt |
| C — Chạy nền | 04, 05, 06 | Scheduler/recovery/crawler/session tests đạt |
| D — Nhân viên sử dụng | 07, 08 | Nhận dạng, CRUD, CRM, RBAC và UI flow đạt |
| E — Bàn giao | 10, 11, 12 | Build/CI/OS/backup/soak đạt; live test có trạng thái rõ ràng |

Task 11 được viết và chạy cùng từng giai đoạn, không chờ đến cuối. Sau mỗi giai đoạn báo ngắn: đã sửa gì, test nào chạy thật, kết quả, điểm còn thiếu và commit. Tiếp tục giai đoạn sau khi đủ điều kiện; chỉ hỏi chủ tiệm về thông tin thực sự thiếu như Page ID, giá dịch vụ, phiên hoặc bài test.

**Điều kiện hoàn thành toàn tool:** mọi chức năng nêu trên nối được qua UI → API → DB → worker; không mất dữ liệu hoặc gửi trùng trong test cạnh tranh; chỉ submit bằng Page được xác minh; không xác nhận bình luận cũ; lịch quét tồn tại sau restart; CSKH nhận dữ liệu thật; cài đặt được trên hai OS; tài liệu và bằng chứng khớp với mã nguồn đã bàn giao.
