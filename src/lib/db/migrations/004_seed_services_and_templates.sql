-- 004_seed_services_and_templates.sql
-- Seed default services for Maison MIPA
INSERT INTO services (id, code, name, base_price, price_note, service_area, includes_posing_support, is_active, created_at, updated_at)
VALUES 
    ('srv-01', 'CA_NHAN', 'Chụp Cá Nhân / Tốt Nghiệp / Nàng Thơ', 990000, 'Gói cá nhân 1 người, tặng kèm makeup nhẹ, chỉnh sửa 15 ảnh chuyên sâu', 'TP. Hồ Chí Minh & Studio Maison MIPA', true, true, NOW(), NOW()),
    ('srv-02', 'COUPLE', 'Chụp Couple / Cặp Đôi / Người Yêu', 1500000, 'Gói 2 người, tặng kèm makeup nữ, hỗ trợ tạo dáng lãng mạn, chỉnh sửa 20 ảnh', 'TP. Hồ Chí Minh & Ngoại cảnh/Studio', true, true, NOW(), NOW()),
    ('srv-03', 'AO_DAI', 'Chụp Ảnh Áo Dài Nghệ Thuật & Truyền Thống', 1200000, 'Gói 1-2 người, kèm phụ kiện nón lá/quạt/hoa sen, chỉnh sửa 15 ảnh', 'TP. Hồ Chí Minh (Q.1, Q.3, Bình Thạnh, Thủ Đức)', true, true, NOW(), NOW()),
    ('srv-04', 'KY_YEU_NHOM', 'Kỷ Yếu Nhóm & Tập Thể Lớp', 2500000, 'Gói nhóm từ 5-10 bạn trở lên, chụp ngoại cảnh + trường học', 'TP. Hồ Chí Minh & Bình Dương', true, true, NOW(), NOW()),
    ('srv-05', 'CUOI_HOI', 'Chụp Cưới / Phóng Sự Cưới / Pre-Wedding', 3500000, 'Trọn gói cô dâu chú rể, chụp ngày lễ/tiệc hoặc ngoại cảnh', 'TP. Hồ Chí Minh', true, true, NOW(), NOW()),
    ('srv-06', 'GIA_DINH', 'Ảnh Gia Đình & Em Bé', 2200000, 'Gói gia đình 3-5 thành viên, phòng chụp máy lạnh riêng biệt', 'Studio Maison MIPA (Quận 1, TP.HCM)', true, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Seed default outreach templates for Maison MIPA
INSERT INTO outreach_templates (id, service_id, title, template_content, allowed_placeholders, is_approved, version, updated_by_name, created_at, updated_at)
VALUES
    ('tpl-01', 'srv-01', 'Mẫu Cá Nhân & Tốt Nghiệp (Nêu Giá & Stylist Chỉ Dáng)', 'Chào {ten_khach} nha! Maison MIPA có gói chụp cá nhân / tốt nghiệp tại {khu_vuc} giá chỉ từ {gia} ({ho_tro_tao_dang}). Bên mình có sẵn đồ cử nhân và stylist chỉ dáng từng góc cực tự nhiên. Bạn nhắn Page để tiệm gửi album ảnh mẫu tham khảo nhé!', '["{gia}", "{khu_vuc}", "{ho_tro_tao_dang}", "{ten_dich_vu}", "{ten_khach}"]', true, 1, 'Admin Maison MIPA', NOW(), NOW()),
    ('tpl-02', 'srv-02', 'Mẫu Couple / Cặp Đôi (Tình Cảm, Lãng Mạn)', 'Dạ chào 2 bạn nha! Gói chụp Couple / Cặp đôi bên Maison MIPA tại {khu_vuc} trọn gói chỉ {gia} ạ ({ho_tro_tao_dang}). Nhiếp ảnh bên mình bắt trọn từng khoảnh khắc tình cảm tự nhiên của 2 bạn. Ghé Page xem album couple vừa chụp nhé!', '["{gia}", "{khu_vuc}", "{ho_tro_dang}", "{ten_dich_vu}"]', true, 1, 'Admin Maison MIPA', NOW(), NOW()),
    ('tpl-03', 'srv-03', 'Mẫu Áo Dài Nghệ Thuật (Nhẹ Nhàng & Tạo Dáng)', 'Chào bạn nha, Maison MIPA chuyên các bộ ảnh Áo dài tại {khu_vuc} ({gia}). Bên mình có stylist hướng dẫn tạo dáng chi tiết từng góc chụp cho bạn hoàn toàn yên tâm nhé! Bạn nhắn Page để tiệm gửi album ảnh mẫu tham khảo nha.', '["{gia}", "{khu_vuc}", "{ho_tro_tao_dang}"]', true, 1, 'Admin Maison MIPA', NOW(), NOW()),
    ('tpl-04', 'srv-04', 'Mẫu Kỷ Yếu Nhóm & Tập Thể Lớp', 'Chào các bạn, Maison MIPA có gói chụp kỷ yếu nhóm tại {khu_vuc} giá chỉ từ {gia}. Studio hỗ trợ lên concept và hướng dẫn tạo dáng cho cả nhóm cực tự nhiên. Bạn nhắn Page để team tư vấn lịch chụp nhé!', '["{gia}", "{khu_vuc}", "{ho_tro_tao_dang}"]', true, 1, 'Admin Maison MIPA', NOW(), NOW()),
    ('tpl-05', 'srv-05', 'Mẫu Cưới Hỏi & Pre-Wedding', 'Maison MIPA chúc mừng ngày vui của 2 bạn nhé! Gói chụp cưới / phóng sự cưới tại {khu_vuc} trọn gói chỉ từ {gia}. Ekip luôn đồng hành ghi lại khoảnh khắc hạnh phúc nhất. Nhắn tin Page để nhận trọn bộ ưu đãi cưới nha!', '["{gia}", "{khu_vuc}"]', true, 1, 'Admin Maison MIPA', NOW(), NOW()),
    ('tpl-06', 'srv-06', 'Mẫu Gia Đình & Em Bé', 'Chào gia đình mình nha, Maison MIPA có gói ảnh gia đình ấm cúng tại {khu_vuc} giá từ {gia}. Phòng chụp riêng biệt máy lạnh, thợ nhiệt tình kiên nhẫn với các bé. Nhắn Page tiệm tư vấn nha!', '["{gia}", "{khu_vuc}"]', true, 1, 'Admin Maison MIPA', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
