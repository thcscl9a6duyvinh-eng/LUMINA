LUMINA v1.5.12 - Voice hotfix

FIX CHÍNH:
1) Gỡ trường raw_voice khỏi payload ghi transactions. Đây là nguyên nhân voice bị báo schema cache và không lưu giao dịch.
2) Trạng thái UI "Đang nghe" được tắt/render lại NGAY khi mic dừng, trước khi parse hoặc ghi Supabase.
3) Payload transaction được whitelist đúng các cột DB để tránh lỗi tương tự trong tương lai.
4) Không thay đổi schema database so với v1.5.11. Nếu SQL v1.5.11 đã chạy thành công, KHÔNG cần chạy SQL lại.

DEPLOY:
- Điền SUPABASE_URL + SUPABASE_ANON_KEY vào app.js.
- Deploy index.html, styles.css, app.js, sw.js.
- Từ v1.5.11, bấm Đồng ý cập nhật khi popup v1.5.12 xuất hiện.
